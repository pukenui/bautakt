import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GeometrieErgebnis } from './geometrie.js';

/*
 * 3D-Szene des IFC-Viewers (E-87, E-89) mit three.js. Je Punkt ein Zustand
 * (0 = ausgeblendet, 1 = sichtbar, 2 = ausgewählt), den der Shader auswertet – so bleiben
 * Ein-/Ausblenden und Auswahl auch bei großen Modellen schnell.
 */

/**
 * 0 ausgeblendet, 1 sichtbar, 2 ausgewählt, 3 Geist (gerastert durchsichtig, 4D),
 * 4 getönt mit eigener Farbe (4D: in Arbeit, Gewerk, verspätet).
 */
export type Zustand = 0 | 1 | 2 | 3 | 4;
export type Ansicht = 'iso' | 'oben' | 'vorne' | 'seite';

interface ModellSzene {
  geo: GeometrieErgebnis;
  meshes: THREE.Mesh[];
  zustand: THREE.BufferAttribute[];
  /** Farbe je Punkt für Zustand 4 (RGB 0–1) */
  toenung: THREE.BufferAttribute[];
  /** express_id → [teil, start, ende][] */
  bereiche: Map<number, [number, number, number][]>;
  /** Lage der Puffer in der Szene (gemeinsamer Ursprung aller Modelle) */
  versatz: THREE.Vector3;
}

export interface Treffer {
  modellId: string;
  expressId: number;
  punkt: THREE.Vector3;
}

const AUSWAHL_FARBE = 'vec3(0.12, 0.37, 0.66)';

function material(transparent: boolean): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent,
    depthWrite: !transparent,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float zustand;\nattribute vec3 toenung;\nvarying float vZustand;\nvarying vec3 vToenung;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvZustand = zustand;\nvToenung = toenung;',
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vZustand;\nvarying vec3 vToenung;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        // Geist: Rasterung statt echter Transparenz (keine Sortierprobleme)
        'if (vZustand < 0.5) discard;\nif (vZustand > 2.5 && vZustand < 3.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 3.0) > 0.5) discard;\n#include <clipping_planes_fragment>',
      )
      .replace(
        '#include <dithering_fragment>',
        `if (vZustand > 3.5) gl_FragColor.rgb = mix(gl_FragColor.rgb, vToenung, 0.8);\nelse if (vZustand > 2.5) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.82), 0.7);\nelse if (vZustand > 1.5) gl_FragColor.rgb = mix(gl_FragColor.rgb, ${AUSWAHL_FARBE}, 0.65);\n#include <dithering_fragment>`,
      );
  };
  return m;
}

export class Szene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly kamera = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
  private readonly steuerung: OrbitControls;
  private readonly opak = material(false);
  private readonly durchsichtig = material(true);
  private readonly modelle = new Map<string, ModellSzene>();
  private readonly messGruppe = new THREE.Group();
  private readonly messungen: { a: THREE.Vector3; b: THREE.Vector3; label: HTMLDivElement }[] = [];
  private messStart: { punkt: THREE.Vector3; marke: THREE.Object3D } | null = null;
  private schnitt: THREE.Plane | null = null;
  private angefordert = false;
  private readonly beobachter: ResizeObserver;
  /** Verschiebung des ersten Modells: alle Modelle werden relativ dazu gelegt (Fachmodelle deckungsgleich) */
  private bezug: THREE.Vector3 | null = null;
  /** Ebene für Maßbeschriftungen über der Leinwand */
  private readonly beschriftung: HTMLDivElement;

  constructor(private readonly behaelter: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xeef0f2);
    this.renderer.localClippingEnabled = true;
    behaelter.appendChild(this.renderer.domElement);
    this.beschriftung = document.createElement('div');
    this.beschriftung.className = 'bim-beschriftung';
    behaelter.appendChild(this.beschriftung);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 1.6));
    const licht = new THREE.DirectionalLight(0xffffff, 1.4);
    licht.position.set(0.4, 1, 0.6);
    this.kamera.add(licht);
    this.scene.add(this.kamera);
    this.scene.add(this.messGruppe);
    this.steuerung = new OrbitControls(this.kamera, this.renderer.domElement);
    this.steuerung.enableDamping = false;
    this.steuerung.screenSpacePanning = true;
    this.steuerung.addEventListener('change', () => this.anfordern());
    this.beobachter = new ResizeObserver(() => this.groesse());
    this.beobachter.observe(behaelter);
    this.groesse();
  }

  get leinwand(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private groesse(): void {
    const b = Math.max(1, this.behaelter.clientWidth);
    const h = Math.max(1, this.behaelter.clientHeight);
    this.renderer.setSize(b, h, false);
    this.kamera.aspect = b / h;
    this.kamera.updateProjectionMatrix();
    this.anfordern();
  }

  /** Zeichnen beim nächsten Bild (nur bei Änderungen, keine Dauerschleife). */
  anfordern(): void {
    if (this.angefordert) return;
    this.angefordert = true;
    requestAnimationFrame(() => {
      this.angefordert = false;
      this.renderer.render(this.scene, this.kamera);
      this.beschriftungen();
    });
  }

  modellSetzen(id: string, geo: GeometrieErgebnis): void {
    this.modellEntfernen(id);
    const bereiche = new Map<number, [number, number, number][]>();
    const b = geo.bereiche;
    for (let i = 0; i + 3 < b.length; i += 4) {
      const e = b[i] ?? 0;
      const liste = bereiche.get(e) ?? [];
      liste.push([b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0]);
      bereiche.set(e, liste);
    }
    const eigene = new THREE.Vector3().fromArray(geo.verschiebung);
    this.bezug ??= eigene.clone();
    // Punkt im Original = Puffer − eigene; in der Szene: Original + bezug
    const versatz = this.bezug.clone().sub(eigene);
    const meshes: THREE.Mesh[] = [];
    const zustand: THREE.BufferAttribute[] = [];
    const toenung: THREE.BufferAttribute[] = [];
    geo.teile.forEach((t, nr) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(t.positionen, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(t.normalen, 3));
      g.setAttribute('color', new THREE.BufferAttribute(t.farben, 4, true));
      const z = new THREE.BufferAttribute(new Float32Array(t.positionen.length / 3).fill(1), 1);
      g.setAttribute('zustand', z);
      const tn = new THREE.BufferAttribute(new Float32Array(t.positionen.length), 3);
      g.setAttribute('toenung', tn);
      toenung.push(tn);
      g.setIndex(new THREE.BufferAttribute(t.indizes, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, t.transparent ? this.durchsichtig : this.opak);
      mesh.userData = { modellId: id, teil: nr };
      if (t.transparent) mesh.renderOrder = 1;
      mesh.position.copy(versatz);
      mesh.updateMatrixWorld();
      this.scene.add(mesh);
      meshes.push(mesh);
      zustand.push(z);
    });
    this.modelle.set(id, { geo, meshes, zustand, toenung, bereiche, versatz });
    this.anfordern();
  }

  modellEntfernen(id: string): void {
    const m = this.modelle.get(id);
    if (!m) return;
    for (const mesh of m.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.modelle.delete(id);
    if (this.modelle.size === 0) this.bezug = null;
    this.anfordern();
  }

  modellIds(): string[] {
    return [...this.modelle.keys()];
  }

  /**
   * Zustand aller Bauteile setzen (Sichtbarkeit, Auswahl, 4D). `farbe` liefert für Zustand 4 die
   * Tönung als RGB (0–1).
   */
  zustandSetzen(
    fn: (modellId: string, expressId: number) => Zustand,
    farbe?: (modellId: string, expressId: number) => [number, number, number],
  ): void {
    for (const [id, m] of this.modelle) {
      const felder = m.zustand.map((z) => z.array as Float32Array);
      const toene = m.toenung.map((z) => z.array as Float32Array);
      let getoent = false;
      for (const [e, liste] of m.bereiche) {
        const wert = fn(id, e);
        for (const [teil, start, ende] of liste) felder[teil]?.fill(wert, start, ende);
        if (wert === 4 && farbe) {
          getoent = true;
          const [rr, gg, bb] = farbe(id, e);
          for (const [teil, start, ende] of liste) {
            const t = toene[teil];
            if (!t) continue;
            for (let i = start; i < ende; i++) {
              t[i * 3] = rr;
              t[i * 3 + 1] = gg;
              t[i * 3 + 2] = bb;
            }
          }
        }
      }
      m.zustand.forEach((z) => (z.needsUpdate = true));
      if (getoent) m.toenung.forEach((z) => (z.needsUpdate = true));
    }
    this.anfordern();
  }

  /** Bild der aktuellen Ansicht (PNG als Data-URL). */
  bild(): string {
    this.renderer.render(this.scene, this.kamera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** Begrenzung sichtbarer (oder aller) Bauteile. */
  grenzen(nur?: (modellId: string, expressId: number) => boolean): THREE.Box3 {
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (const [id, m] of this.modelle) {
      if (!nur) {
        box
          .expandByPoint(p.fromArray(m.geo.min).add(m.versatz))
          .expandByPoint(p.fromArray(m.geo.max).add(m.versatz));
        continue;
      }
      for (const [e, liste] of m.bereiche) {
        if (!nur(id, e)) continue;
        for (const [teil, start, ende] of liste) {
          const pos = m.geo.teile[teil]?.positionen;
          if (!pos) continue;
          for (let i = start; i < ende; i++)
            box.expandByPoint(p.fromArray(pos, i * 3).add(m.versatz));
        }
      }
    }
    return box;
  }

  /** Kamera auf eine Begrenzung ausrichten. */
  einpassen(box: THREE.Box3, ansicht: Ansicht = 'iso'): void {
    if (box.isEmpty()) return;
    const mitte = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
    const richtung = {
      iso: new THREE.Vector3(1, 0.8, 1),
      oben: new THREE.Vector3(0, 1, 0.0001),
      vorne: new THREE.Vector3(0, 0.15, 1),
      seite: new THREE.Vector3(1, 0.15, 0),
    }[ansicht].normalize();
    const abstand = radius / Math.sin(THREE.MathUtils.degToRad(this.kamera.fov / 2));
    this.kamera.position.copy(mitte).addScaledVector(richtung, abstand);
    this.kamera.near = Math.max(0.01, abstand / 1000);
    this.kamera.far = abstand * 20;
    this.kamera.updateProjectionMatrix();
    this.steuerung.target.copy(mitte);
    this.steuerung.update();
    this.anfordern();
  }

  /** Bauteil unter dem Mauszeiger (ausgeblendete und weggeschnittene Teile zählen nicht). */
  treffer(x: number, y: number): Treffer | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((x - r.left) / r.width) * 2 - 1,
      -((y - r.top) / r.height) * 2 + 1,
    );
    const strahl = new THREE.Raycaster();
    strahl.setFromCamera(ndc, this.kamera);
    const meshes = [...this.modelle.values()].flatMap((m) => m.meshes);
    for (const t of strahl.intersectObjects(meshes, false)) {
      const { modellId, teil } = t.object.userData as { modellId: string; teil: number };
      const m = this.modelle.get(modellId);
      const a = t.face?.a;
      if (!m || a === undefined) continue;
      if (((m.zustand[teil]?.array as Float32Array | undefined)?.[a] ?? 0) < 0.5) continue;
      if (this.schnitt && this.schnitt.distanceToPoint(t.point) < 0) continue;
      const expressId = m.geo.teile[teil]?.ids[a];
      if (expressId === undefined) continue;
      return { modellId, expressId, punkt: t.point.clone() };
    }
    return null;
  }

  /** Schnittebene setzen (null = kein Schnitt). Sichtbar bleibt die Seite, in die die Normale zeigt. */
  schnittSetzen(ebene: THREE.Plane | null): void {
    this.schnitt = ebene;
    const ebenen = ebene ? [ebene] : [];
    this.opak.clippingPlanes = ebenen;
    this.durchsichtig.clippingPlanes = ebenen;
    this.anfordern();
  }

  /** Niedrigster Punkt (y) der angegebenen Bauteile eines Modells – für den Geschossschnitt. */
  tiefsterPunkt(modellId: string, expressIds: Iterable<number>): number | null {
    const m = this.modelle.get(modellId);
    if (!m) return null;
    let min = Infinity;
    for (const e of expressIds)
      for (const [teil, start, ende] of m.bereiche.get(e) ?? []) {
        const pos = m.geo.teile[teil]?.positionen;
        if (!pos) continue;
        for (let i = start; i < ende; i++) min = Math.min(min, pos[i * 3 + 1] ?? Infinity);
      }
    return Number.isFinite(min) ? min + m.versatz.y : null;
  }

  // --- Messen (E-89) -----------------------------------------------------------------------

  private markenGroesse(): number {
    return Math.max(0.02, this.grenzen().getSize(new THREE.Vector3()).length() * 0.003);
  }

  private marke(p: THREE.Vector3): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(this.markenGroesse(), 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xc62828, depthTest: false }),
    );
    m.position.copy(p);
    m.renderOrder = 10;
    this.messGruppe.add(m);
    return m;
  }

  /** Messpunkt setzen; liefert die Länge, wenn eine Messung fertig ist. */
  messpunkt(p: THREE.Vector3): number | null {
    if (!this.messStart) {
      this.messStart = { punkt: p.clone(), marke: this.marke(p) };
      this.anfordern();
      return null;
    }
    const a = this.messStart.punkt;
    this.messStart = null;
    this.marke(p);
    const linie = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, p]),
      new THREE.LineBasicMaterial({ color: 0xc62828, depthTest: false }),
    );
    linie.renderOrder = 10;
    this.messGruppe.add(linie);
    const label = document.createElement('div');
    label.className = 'bim-masz';
    const laenge = a.distanceTo(p);
    label.textContent = `${laenge.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m`;
    this.beschriftung.appendChild(label);
    this.messungen.push({ a: a.clone(), b: p.clone(), label });
    this.anfordern();
    return laenge;
  }

  /** Angefangene Messung verwerfen. */
  messungAbbrechen(): void {
    if (!this.messStart) return;
    this.messGruppe.remove(this.messStart.marke);
    this.messStart = null;
    this.anfordern();
  }

  messungenLoeschen(): void {
    this.messStart = null;
    for (const o of [...this.messGruppe.children]) {
      this.messGruppe.remove(o);
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
    }
    for (const m of this.messungen) m.label.remove();
    this.messungen.length = 0;
    this.anfordern();
  }

  get anzahlMessungen(): number {
    return this.messungen.length;
  }

  private beschriftungen(): void {
    const b = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    for (const m of this.messungen) {
      const p = m.a.clone().add(m.b).multiplyScalar(0.5).project(this.kamera);
      const hinten = p.z > 1;
      m.label.style.display = hinten ? 'none' : '';
      m.label.style.left = `${((p.x + 1) / 2) * b}px`;
      m.label.style.top = `${((1 - p.y) / 2) * h}px`;
    }
  }

  freigeben(): void {
    this.beobachter.disconnect();
    this.messungenLoeschen();
    for (const id of this.modellIds()) this.modellEntfernen(id);
    this.steuerung.dispose();
    this.opak.dispose();
    this.durchsichtig.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.beschriftung.remove();
  }
}
