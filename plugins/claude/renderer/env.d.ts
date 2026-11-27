declare module '*.md?raw' {
  const inhalt: string;
  export default inhalt;
}

declare module '*?url' {
  const url: string;
  export default url;
}

declare module '*.css';
