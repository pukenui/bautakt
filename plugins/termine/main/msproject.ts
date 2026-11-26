import type { PluginDb } from '@bautakt/kern';
import { datumVonTag, tagVonDatum } from '@bautakt/rechnen-kalender';
import type { Art, Einheit } from '@bautakt/rechnen-termine';
import { XMLParser } from 'fast-xml-parser';
import type { VorgangTyp } from '../gemeinsam/typen.js';
import { arbeitskalender, planDatenLaden } from './daten.js';

/**
 * MS-Project-XML (MSPDI, E-25, E-79–E-82). Ein Arbeitstag = 8 h (480 min), Beginn 08:00,
 * Ende 17:00. Abstände in MSPDI in Zehntelminuten.
 */
const MIN_JE_TAG = 480;
const ART_NACH_MSP: Record<Art, number> = { EE: 0, EA: 1, AE: 2, AA: 3 };
const MSP_NACH_ART: Record<number, Art> = { 0: 'EE', 1: 'EA', 2: 'AE', 3: 'AA' };
/** Lag-Formate „fortlaufend“ (elapsed) in MSPDI */
const FORTLAUFEND = new Set([4, 6, 8, 10, 12, 20, 36, 38, 40, 42, 44, 52]);

const x = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const tag = (name: string, wert: string | number | null | undefined) =>
  wert === null || wert === undefined || wert === '' ? '' : `<${name}>${x(wert)}</${name}>`;
const dauer = (at: number) => `PT${Math.max(0, at) * 8}H0M0S`;
const beginn = (iso: string) => `${iso}T08:00:00`;
const ende = (iso: string) => `${iso}T17:00:00`;

/** Plan als MSPDI-XML (E-80). */
export function msProjectExport(
  db: PluginDb,
  planId: string,
  sollStandId: string | null,
  projektname: string,
): string {
  const d = planDatenLaden(db, planId, sollStandId);
  const b = d.berechnung;
  if (!b.ok) throw new Error(`Der Plan ist nicht rechenbar: ${b.fehler}`);
  const kal = arbeitskalender(d.plan, d.kalender, d.ruhezeiten);
  const uid = new Map(d.vorgaenge.map((v, i) => [v.id, i + 1]));
  const start = d.plan.projektstart ?? kal.start;

  // Ausnahmen: Feiertage und Ruhezeiten zwischen Projektstart und Projektende (+ 1 Jahr Reserve)
  const ausnahmen: { name: string; von: string; bis: string }[] = [];
  const bisTag = tagVonDatum(b.projektendeDatum) + 365;
  for (let t = tagVonDatum(start); t <= bisTag; t++) {
    const iso = datumVonTag(t);
    const g = kal.freigrund(iso);
    if (!g || g.art === 'wochenende') continue;
    const letzte = ausnahmen.at(-1);
    if (letzte && letzte.name === g.name && tagVonDatum(letzte.bis) === t - 1) letzte.bis = iso;
    else ausnahmen.push({ name: g.name, von: iso, bis: iso });
  }
  // MSPDI-Wochentage: 1 = Sonntag … 7 = Samstag; Bautakt: Mo … So
  const wochentage = [1, 2, 3, 4, 5, 6, 7]
    .map((typ) => {
      const arbeit = d.kalender.arbeitstage[(typ + 5) % 7] ?? false;
      return `<WeekDay><DayType>${typ}</DayType><DayWorking>${arbeit ? 1 : 0}</DayWorking>${
        arbeit
          ? '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>'
          : ''
      }</WeekDay>`;
    })
    .join('');
  const ausnahmenXml = ausnahmen
    .map(
      (a) =>
        `<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${a.von}T00:00:00</FromDate><ToDate>${a.bis}T23:59:00</ToDate></TimePeriod><Occurrences>1</Occurrences>${tag('Name', a.name)}<Type>1</Type><DayWorking>0</DayWorking></Exception>`,
    )
    .join('');

  const outline: number[] = [];
  const tasks = d.vorgaenge.map((v) => {
    outline.length = v.ebene + 1;
    outline[v.ebene] = (outline[v.ebene] ?? 0) + 1;
    const t = b.termine[v.id];
    const meilenstein = v.typ === 'meilenstein';
    const dauerAt = v.typ === 'sammel' ? (t ? t.fez - t.faz : 0) : meilenstein ? 0 : v.dauer_at;
    const anfang = t ? (meilenstein ? ende(t.ende) : beginn(t.anfang)) : '';
    const fertigDatum = t ? ende(t.ende) : '';
    const vorgaenger = d.beziehungen
      .filter((z) => z.nach_id === v.id && uid.has(z.von_id))
      .map(
        (z) =>
          `<PredecessorLink><PredecessorUID>${uid.get(z.von_id)}</PredecessorUID><Type>${ART_NACH_MSP[z.art]}</Type><CrossProject>0</CrossProject><LinkLag>${
            z.abstand * (z.einheit === 'KT' ? 1440 : MIN_JE_TAG) * 10
          }</LinkLag><LagFormat>${z.einheit === 'KT' ? 8 : 7}</LagFormat></PredecessorLink>`,
      )
      .join('');
    // Bedingung (E-19)
    const constraint =
      v.bedingung_typ === 'nicht_frueher_als' && v.bedingung_datum
        ? `<ConstraintType>4</ConstraintType><ConstraintDate>${beginn(v.bedingung_datum)}</ConstraintDate>`
        : v.bedingung_typ === 'muss_enden_am' && v.bedingung_datum
          ? `<ConstraintType>3</ConstraintType><ConstraintDate>${ende(v.bedingung_datum)}</ConstraintDate>`
          : '<ConstraintType>0</ConstraintType>';
    // Ist (Statusdatum = Stichtag)
    const ist = d.ist[v.id];
    let istXml = '';
    if (ist && t && v.typ !== 'sammel') {
      const prozent =
        t.status === 'fertig'
          ? 100
          : (ist.fertig_prozent ??
            (ist.restdauer_at !== null && v.dauer_at > 0
              ? Math.max(
                  0,
                  Math.min(99, Math.round(((v.dauer_at - ist.restdauer_at) / v.dauer_at) * 100)),
                )
              : 0));
      istXml = `${tag('ActualStart', ist.ist_anfang ? beginn(ist.ist_anfang) : meilenstein && ist.ist_ende ? ende(ist.ist_ende) : '')}${tag(
        'ActualFinish',
        ist.ist_ende ? ende(ist.ist_ende) : '',
      )}<PercentComplete>${prozent}</PercentComplete>`;
    }
    // Basisplan 0 = Soll-Vergleichsstand
    const soll = d.vergleich?.termine[v.id];
    const basis = soll
      ? `<Baseline><Number>0</Number><Start>${meilenstein ? ende(soll.ende) : beginn(soll.anfang)}</Start><Finish>${ende(soll.ende)}</Finish><Duration>${dauer(soll.fez - soll.faz)}</Duration></Baseline>`
      : '';
    const notiz = [
      v.quelle_annahme && `Quelle/Annahme: ${v.quelle_annahme}`,
      v.gewerk && `Gewerk: ${v.gewerk}`,
      v.rolle && `Verantwortlich: ${v.rolle}`,
      v.dauer_herleitung && `Herleitung: ${v.dauer_herleitung}`,
      v.anmerkung && `Anmerkung: ${v.anmerkung}`,
    ]
      .filter(Boolean)
      .join('\n');
    return `<Task><UID>${uid.get(v.id)}</UID><ID>${uid.get(v.id)}</ID>${tag('Name', v.name)}<Type>1</Type><IsNull>0</IsNull>${tag(
      'WBS',
      v.nr,
    )}<OutlineNumber>${outline.join('.')}</OutlineNumber><OutlineLevel>${v.ebene + 1}</OutlineLevel>${tag('Start', anfang)}${tag(
      'Finish',
      fertigDatum,
    )}<Duration>${dauer(dauerAt)}</Duration><DurationFormat>7</DurationFormat><Milestone>${meilenstein ? 1 : 0}</Milestone><Summary>${
      v.typ === 'sammel' ? 1 : 0
    }</Summary><Critical>${t?.kritisch ? 1 : 0}</Critical><Manual>0</Manual>${constraint}${tag('Notes', notiz)}${istXml}${basis}${vorgaenger}</Task>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project"><SaveVersion>14</SaveVersion>${tag('Name', `${d.plan.name}.xml`)}${tag(
    'Title',
    `${projektname} – ${d.plan.name}`,
  )}<ScheduleFromStart>1</ScheduleFromStart><StartDate>${beginn(start)}</StartDate><FinishDate>${ende(b.projektendeDatum)}</FinishDate>${tag(
    'StatusDate',
    d.plan.stichtag ? ende(d.plan.stichtag) : '',
  )}<CalendarUID>1</CalendarUID><DefaultStartTime>08:00:00</DefaultStartTime><DefaultFinishTime>17:00:00</DefaultFinishTime><MinutesPerDay>${MIN_JE_TAG}</MinutesPerDay><MinutesPerWeek>${
    MIN_JE_TAG * d.kalender.arbeitstage.filter(Boolean).length
  }</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth><DurationFormat>7</DurationFormat><Calendars><Calendar><UID>1</UID><Name>Bautakt</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${wochentage}</WeekDays>${
    ausnahmenXml ? `<Exceptions>${ausnahmenXml}</Exceptions>` : ''
  }</Calendar></Calendars><Tasks>${tasks.join('')}</Tasks><Resources/><Assignments/></Project>
`;
}

// --- Import ---------------------------------------------------------------------------

export interface ImportVorgang {
  schluessel: string;
  parent: string | null;
  nr: string;
  name: string;
  typ: VorgangTyp;
  dauer: number;
  quelle_annahme: string;
  anmerkung: string;
  gewerk: string;
  rolle: string;
  bedingung_typ: 'keine' | 'nicht_frueher_als' | 'muss_enden_am';
  bedingung_datum: string | null;
}

export interface ImportDaten {
  plan: {
    name: string;
    projektstart: string | null;
    arbeitstage: boolean[];
    ruhezeiten: { von: string; bis: string; name: string }[];
    stichtag: string | null;
  };
  vorgaenge: ImportVorgang[];
  beziehungen: { von: string; nach: string; art: Art; abstand: number; einheit: Einheit }[];
  ist: {
    vorgang: string;
    ist_anfang: string | null;
    ist_ende: string | null;
    fertig_prozent: number | null;
  }[];
}

type Knoten = Record<string, unknown>;
const text = (k: Knoten | undefined, name: string): string => {
  const w = k?.[name];
  return w === undefined || w === null || typeof w === 'object' ? '' : String(w).trim();
};
const liste = (k: Knoten | undefined, name: string): Knoten[] => {
  const w = k?.[name];
  return Array.isArray(w) ? (w as Knoten[]) : w && typeof w === 'object' ? [w as Knoten] : [];
};
const datumTeil = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/** Minuten einer ISO-Dauer wie „PT560H0M0S“ (MSPDI). */
export function dauerMinuten(s: string): number {
  const m =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      s.trim(),
    );
  if (!m) return 0;
  const [, t, h, min, sek] = m;
  return Number(t ?? 0) * 24 * 60 + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(sek ?? 0) / 60;
}

/**
 * MSPDI-XML lesen (E-79, E-81): liefert die Daten für den Befehl „plan.importieren“ und einen
 * Bericht über Rundungen und weggelassene Inhalte.
 */
export function msProjectLesen(
  xml: string,
  dateiname: string,
): { daten: ImportDaten; bericht: string[] } {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
  const wurzel = parser.parse(xml) as Knoten;
  const p = wurzel['Project'] as Knoten | undefined;
  if (!p || typeof p !== 'object')
    throw new Error('Die Datei ist keine MS-Project-XML-Datei (Element „Project“ fehlt).');
  const bericht: string[] = [];
  const minJeTag = Number(text(p, 'MinutesPerDay')) || MIN_JE_TAG;

  // Kalender
  const kalender = liste(p['Calendars'] as Knoten, 'Calendar');
  const kalUid = text(p, 'CalendarUID');
  const kal = kalender.find((k) => text(k, 'UID') === kalUid) ?? kalender[0];
  const basis =
    kal && text(kal, 'BaseCalendarUID')
      ? kalender.find((k) => text(k, 'UID') === text(kal, 'BaseCalendarUID'))
      : undefined;
  const arbeitstage = [true, true, true, true, true, false, false];
  const ruhezeiten: ImportDaten['plan']['ruhezeiten'] = [];
  for (const k of [basis, kal]) {
    if (!k) continue;
    for (const w of liste(k['WeekDays'] as Knoten, 'WeekDay')) {
      const typ = Number(text(w, 'DayType'));
      const arbeit = text(w, 'DayWorking') === '1';
      if (typ >= 1 && typ <= 7) arbeitstage[(typ + 5) % 7] = arbeit;
      else if (typ === 0 && !arbeit) {
        const tp = w['TimePeriod'] as Knoten | undefined;
        const von = datumTeil(text(tp, 'FromDate'));
        const bis = datumTeil(text(tp, 'ToDate'));
        if (von && bis) ruhezeiten.push({ von, bis, name: 'arbeitsfrei' });
      }
    }
    for (const a of liste(k['Exceptions'] as Knoten, 'Exception')) {
      if (text(a, 'DayWorking') === '1') {
        bericht.push(
          `Kalenderausnahme „${text(a, 'Name') || 'ohne Namen'}“ (zusätzlicher Arbeitstag) weggelassen.`,
        );
        continue;
      }
      const tp = a['TimePeriod'] as Knoten | undefined;
      const von = datumTeil(text(tp, 'FromDate'));
      const bis = datumTeil(text(tp, 'ToDate'));
      const wiederkehrend =
        !['', '1'].includes(text(a, 'Type')) && Number(text(a, 'Occurrences') || '1') > 1;
      if (!von || !bis || wiederkehrend) {
        bericht.push(
          `Wiederkehrende Kalenderausnahme „${text(a, 'Name') || 'ohne Namen'}“ weggelassen – bitte als Ruhezeit prüfen.`,
        );
        continue;
      }
      ruhezeiten.push({ von, bis, name: text(a, 'Name') || 'arbeitsfrei' });
    }
  }

  // Vorgänge
  const tasks = liste(p['Tasks'] as Knoten, 'Task').filter(
    (t) =>
      text(t, 'IsNull') !== '1' &&
      Number(text(t, 'OutlineLevel') || '1') >= 1 &&
      text(t, 'UID') !== '0',
  );
  const typJeUid = new Map<string, VorgangTyp>();
  const kette: string[] = [];
  const nrs = new Set<string>();
  const vorgaenge: ImportVorgang[] = [];
  let gerundet = 0;
  for (const t of tasks) {
    const u = text(t, 'UID');
    const ebene = Math.max(1, Number(text(t, 'OutlineLevel') || '1'));
    kette.length = ebene - 1;
    const parent = kette[ebene - 2] ?? null;
    kette[ebene - 1] = u;
    const typ: VorgangTyp =
      text(t, 'Summary') === '1'
        ? 'sammel'
        : text(t, 'Milestone') === '1'
          ? 'meilenstein'
          : 'vorgang';
    typJeUid.set(u, typ);
    const minuten = dauerMinuten(text(t, 'Duration'));
    const exakt = minuten / minJeTag;
    const at = typ === 'vorgang' ? Math.max(0, Math.ceil(exakt - 1e-9)) : 0;
    if (typ === 'vorgang' && Math.abs(exakt - at) > 1e-6) gerundet++;
    let nr =
      (text(t, 'WBS') || text(t, 'ID') || u).replace(/[^\p{L}\p{N}_.]/gu, '_').slice(0, 30) || u;
    while (nrs.has(nr.toLowerCase())) nr = `${nr}_`;
    nrs.add(nr.toLowerCase());
    // Notiz aus Bautakt-Export zurücklesen
    const notiz = text(t, 'Notes');
    const feld = (name: string) =>
      new RegExp(`^${name}: (.*)$`, 'm').exec(notiz)?.[1]?.trim() ?? '';
    const quelle = feld('Quelle/Annahme');
    const ct = Number(text(t, 'ConstraintType') || '0');
    const cd = datumTeil(text(t, 'ConstraintDate'));
    let bedingung_typ: ImportVorgang['bedingung_typ'] = 'keine';
    if ((ct === 2 || ct === 4) && cd) bedingung_typ = 'nicht_frueher_als';
    else if (ct === 3 && cd) bedingung_typ = 'muss_enden_am';
    else if (ct > 1)
      bericht.push(
        `Einschränkung von „${text(t, 'Name')}“ (Art ${ct}) weggelassen – Bautakt kennt „nicht früher als“ und „muss enden am“.`,
      );
    else if (ct === 1) bericht.push(`„So spät wie möglich“ bei „${text(t, 'Name')}“ weggelassen.`);
    vorgaenge.push({
      schluessel: u,
      parent,
      nr,
      name: (text(t, 'Name') || `Vorgang ${u}`).slice(0, 300),
      typ,
      dauer: at,
      quelle_annahme: typ === 'sammel' ? '' : quelle || `Import MS Project (${dateiname})`,
      anmerkung: feld('Anmerkung') || (quelle || feld('Gewerk') ? '' : notiz).slice(0, 4000),
      gewerk: feld('Gewerk'),
      rolle: feld('Verantwortlich'),
      bedingung_typ,
      bedingung_datum: bedingung_typ === 'keine' ? null : cd,
    });
  }
  if (gerundet) bericht.push(`${gerundet} Dauer(n) auf ganze Arbeitstage aufgerundet.`);

  // Beziehungen
  const beziehungen: ImportDaten['beziehungen'] = [];
  let lagGerundet = 0;
  for (const t of tasks) {
    const nach = text(t, 'UID');
    for (const l of liste(t, 'PredecessorLink')) {
      const von = text(l, 'PredecessorUID');
      if (!typJeUid.has(von)) {
        bericht.push(`Beziehung zu unbekanntem Vorgang (UID ${von}) weggelassen.`);
        continue;
      }
      if (typJeUid.get(von) === 'sammel' || typJeUid.get(nach) === 'sammel') {
        bericht.push(`Beziehung an einem Sammelvorgang (UID ${von} → ${nach}) weggelassen (E-14).`);
        continue;
      }
      const art = MSP_NACH_ART[Number(text(l, 'Type') || '1')] ?? 'EA';
      const lag = Number(text(l, 'LinkLag') || '0');
      const format = Number(text(l, 'LagFormat') || '7');
      let abstand = 0;
      let einheit: Einheit = 'AT';
      if (format === 19 || format === 20 || format === 51 || format === 52) {
        if (lag) bericht.push(`Prozentualer Abstand (UID ${von} → ${nach}) weggelassen.`);
      } else if (FORTLAUFEND.has(format)) {
        einheit = 'KT';
        const exakt = lag / (1440 * 10);
        abstand = Math.round(exakt);
        if (Math.abs(exakt - abstand) > 1e-6) lagGerundet++;
      } else {
        const exakt = lag / (minJeTag * 10);
        abstand = Math.round(exakt);
        if (Math.abs(exakt - abstand) > 1e-6) lagGerundet++;
      }
      beziehungen.push({ von, nach, art, abstand, einheit });
    }
  }
  if (lagGerundet) bericht.push(`${lagGerundet} Abstand/Abstände auf ganze Tage gerundet.`);

  // Ist (Statusdatum)
  const stichtagRoh = datumTeil(text(p, 'StatusDate'));
  const ist: ImportDaten['ist'] = [];
  for (const t of tasks) {
    const u = text(t, 'UID');
    if (typJeUid.get(u) === 'sammel') continue;
    const as = datumTeil(text(t, 'ActualStart'));
    const af = datumTeil(text(t, 'ActualFinish'));
    const pc = Number(text(t, 'PercentComplete') || '0');
    if (!as && !af) continue;
    if (!stichtagRoh) {
      bericht.push('Ist-Werte ohne Statusdatum weggelassen.');
      break;
    }
    if ((as && as > stichtagRoh) || (af && af > stichtagRoh)) {
      bericht.push(`Ist-Werte von UID ${u} liegen nach dem Statusdatum und wurden weggelassen.`);
      continue;
    }
    const meilenstein = typJeUid.get(u) === 'meilenstein';
    if (pc >= 100 || af)
      ist.push({
        vorgang: u,
        ist_anfang: meilenstein ? (af ?? as) : as,
        ist_ende: af ?? (meilenstein ? as : null),
        fertig_prozent: null,
      });
    else
      ist.push({
        vorgang: u,
        ist_anfang: as,
        ist_ende: null,
        fertig_prozent: Math.max(0, Math.min(99, Math.round(pc))),
      });
  }
  const unvollstaendig = ist.filter((i) => !i.ist_ende && !i.ist_anfang);
  if (unvollstaendig.length)
    bericht.push(`${unvollstaendig.length} Ist-Meldung(en) ohne Ist-Anfang weggelassen.`);

  const ressourcen = liste(p['Resources'] as Knoten, 'Resource').filter(
    (r) => text(r, 'UID') !== '0' && text(r, 'Name'),
  );
  if (ressourcen.length)
    bericht.push(`${ressourcen.length} Ressource(n) weggelassen (Bautakt plant ohne Ressourcen).`);
  if (tasks.some((t) => liste(t, 'Baseline').length))
    bericht.push('Basispläne weggelassen – bei Bedarf in Bautakt einen Soll-Stand speichern.');

  return {
    daten: {
      plan: {
        name: (
          text(p, 'Title') ||
          text(p, 'Name').replace(/\.xml$/i, '') ||
          dateiname.replace(/\.xml$/i, '')
        ).slice(0, 300),
        projektstart: datumTeil(text(p, 'StartDate')),
        arbeitstage,
        ruhezeiten,
        stichtag: ist.length ? stichtagRoh : null,
      },
      vorgaenge,
      beziehungen,
      ist: ist.filter((i) => i.ist_ende || i.ist_anfang),
    },
    bericht,
  };
}
