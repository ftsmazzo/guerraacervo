/** Tabela de tradução inglês → português (BISAC / categorias de sebo BR) */
export const TAGS_PT: Record<string, string> = {
  // Ficção
  fiction: "ficção",
  "literary fiction": "ficção literária",
  "science fiction": "ficção científica",
  "sci-fi": "ficção científica",
  scifi: "ficção científica",
  fantasy: "fantasia",
  "urban fantasy": "fantasia urbana",
  "epic fantasy": "fantasia épica",
  horror: "terror",
  thriller: "suspense",
  "psychological thriller": "thriller psicológico",
  mystery: "mistério",
  "crime fiction": "ficção policial",
  "detective fiction": "ficção policial",
  "police procedural": "policial",
  romance: "romance",
  "romantic comedy": "comédia romântica",
  "historical romance": "romance histórico",
  adventure: "aventura",
  "historical fiction": "ficção histórica",
  crime: "crime",
  detective: "detetive",
  "spy stories": "espionagem",
  espionage: "espionagem",
  dystopian: "distopia",
  dystopia: "distopia",
  utopian: "utopia",
  "magical realism": "realismo mágico",
  paranormal: "paranormal",
  western: "faroeste",
  "action & adventure": "aventura",
  "political fiction": "ficção política",
  "war stories": "guerra",
  "gothic fiction": "gótico",

  // Não-ficção
  "non-fiction": "não-ficção",
  nonfiction: "não-ficção",
  biography: "biografia",
  autobiography: "autobiografia",
  memoir: "memórias",
  "self-help": "autoajuda",
  "personal development": "desenvolvimento pessoal",
  "self improvement": "autoajuda",
  business: "negócios",
  economics: "economia",
  entrepreneurship: "empreendedorismo",
  marketing: "marketing",
  finance: "finanças",
  investing: "investimentos",
  history: "história",
  "world history": "história mundial",
  "brazilian history": "história do brasil",
  politics: "política",
  "political science": "ciência política",
  philosophy: "filosofia",
  psychology: "psicologia",
  sociology: "sociologia",
  anthropology: "antropologia",
  science: "ciências",
  technology: "tecnologia",
  computers: "informática",
  "computer science": "informática",
  programming: "programação",
  mathematics: "matemática",
  medicine: "medicina",
  health: "saúde",
  "mental health": "saúde mental",
  cooking: "culinária",
  "cooking & food": "gastronomia",
  food: "gastronomia",
  art: "arte",
  music: "música",
  sports: "esportes",
  travel: "viagem",
  nature: "natureza",
  religion: "religião",
  spirituality: "espiritualidade",
  theology: "teologia",
  christianity: "cristianismo",
  education: "educação",
  "study aids": "didático",
  textbooks: "didático",
  pedagogical: "pedagogia",
  pedagogy: "pedagogia",
  law: "direito",
  "social science": "ciências sociais",
  linguistics: "linguística",
  "language arts": "linguagem",
  journalism: "jornalismo",
  reference: "referência",
  dictionaries: "dicionários",
  encyclopedia: "enciclopédia",

  // Infantil e jovem
  "juvenile fiction": "ficção infantil",
  "juvenile nonfiction": "não-ficção infantil",
  "children's books": "infantil",
  "childrens books": "infantil",
  children: "infantil",
  "young adult": "jovem adulto",
  ya: "jovem adulto",
  "teen fiction": "jovem adulto",
  "picture books": "livros ilustrados",
  "middle grade": "literatura infanto-juvenil",
  "early readers": "primeiras leituras",
  "board books": "livro de banho",

  // Formatos literários / HQ
  poetry: "poesia",
  drama: "drama",
  "short stories": "contos",
  essays: "ensaios",
  comics: "quadrinhos",
  "comic books": "quadrinhos",
  "graphic novels": "romance gráfico",
  "graphic novel": "romance gráfico",
  manga: "mangá",
  manhwa: "manhwa",
  humor: "humor",
  satire: "sátira",
  fable: "fábula",
  "fairy tales": "contos de fadas",
  anthology: "antologia",
  "collected works": "obras completas",

  // Animais
  animals: "animais",
  dogs: "cachorro",
  cats: "gato",
  horses: "cavalo",
  birds: "pássaros",
  wildlife: "vida selvagem",
  pets: "animais de estimação",

  // Temas sociais e humanos
  family: "família",
  friendship: "amizade",
  love: "amor",
  war: "guerra",
  "coming of age": "amadurecimento",
  society: "sociedade",
  culture: "cultura",
  environment: "meio ambiente",
  ecology: "ecologia",
  feminism: "feminismo",
  "gender studies": "gênero",
  lgbt: "lgbt",
  lgbtq: "lgbt",
  "lgbtq+": "lgbt",
  "gay & lesbian": "lgbt",
  racism: "racismo",
  "social issues": "questões sociais",
  immigration: "imigração",
  slavery: "escravidão",
  "civil rights": "direitos civis",

  // Classificações gerais
  classic: "clássico",
  classics: "clássicos",
  literature: "literatura",
  literary: "literário",
  bestseller: "best-seller",
  "contemporary": "contemporâneo",
  "modern": "moderno",
  "20th century": "século xx",
  "21st century": "século xxi",
  brazilian: "brasileiro",
  "latin american": "latino-americano",
  portuguese: "português",
  english: "inglês",
  spanish: "espanhol",
  french: "francês",
  german: "alemão",
  italian: "italiano",
  japanese: "japonês",
  chinese: "chinês",

  // Artes e entretenimento
  cinema: "cinema",
  "performing arts": "artes cênicas",
  theater: "teatro",
  theatre: "teatro",
  photography: "fotografia",
  architecture: "arquitetura",
  crafts: "artesanato",
  gardening: "jardinagem",
  games: "jogos",
  hobbies: "hobbies",
  design: "design",
  fashion: "moda",

  // Sebo BR / escolares
  vestibular: "vestibular",
  enem: "enem",
  didatico: "didático",
  "school books": "didático",
  "juvenile literature": "literatura infantil",
  "brazilian literature": "literatura brasileira",
  "portuguese literature": "literatura portuguesa",
  "world literature": "literatura mundial",
  mythology: "mitologia",
  folklore: "folclore",
  astrology: "astrologia",
  occult: "ocultismo",
  "true crime": "true crime",
  truecrime: "true crime",
  "true crime fiction": "true crime",
};

function foldTag(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function traduzirTag(tag: string): string {
  const l = tag.toLowerCase().trim();
  if (!l) return "";
  if (TAGS_PT[l]) return TAGS_PT[l];
  const folded = foldTag(l);
  for (const [en, pt] of Object.entries(TAGS_PT)) {
    if (folded === foldTag(en) || folded.includes(foldTag(en))) return pt;
  }
  return tag.trim();
}

/** Quebra "Fiction / Literary Fiction" e "Juvenile Fiction — Animals" */
function splitRawTag(raw: string): string[] {
  return raw
    .split(/\s*(?:[\/&,;|]|\s+[-–—]\s+|\s+>\s+)\s*/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function processarTags(
  rawTags: string[],
  opts?: { dropUntranslatedEnglish?: boolean; max?: number },
): string[] {
  const dropEn = opts?.dropUntranslatedEnglish !== false;
  const max = opts?.max ?? 18;
  const ptValues = new Set(Object.values(TAGS_PT).map((v) => foldTag(v)));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of rawTags) {
    if (!raw) continue;
    for (const piece of splitRawTag(String(raw))) {
      const translated = traduzirTag(piece)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (translated.length < 3 || translated.length > 40) continue;

      if (dropEn) {
        const folded = foldTag(translated);
        const isKnownPt = ptValues.has(folded);
        const hasAccent = /[áàâãäéêëíïóôõöúüç]/i.test(translated);
        const looksEnglishOnly = /^[a-z][a-z0-9\s'-]*$/i.test(translated);
        if (!isKnownPt && !hasAccent && looksEnglishOnly) continue;
      }

      const key = foldTag(translated);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(translated);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export type BookTagSeed = {
  genero?: string | null;
  idioma?: string | null;
  colecao?: string | null;
  tipoCapa?: string | null;
  ano?: string | number | null;
  titulo?: string | null;
};

/** Tags estáveis a partir da ficha (úteis no filtro do sebo). */
export function deriveTagsFromBook(seed: BookTagSeed): string[] {
  const raw: string[] = [];

  if (seed.genero) {
    for (const p of splitRawTag(String(seed.genero))) raw.push(p);
  }
  if (seed.colecao) {
    const c = String(seed.colecao).trim();
    if (c.length >= 3 && c.length <= 40) raw.push(c);
  }

  const idioma = String(seed.idioma || "").toLowerCase();
  if (/portug/.test(idioma)) raw.push("português");
  else if (/ingl[eê]s|english/.test(idioma)) raw.push("inglês");
  else if (/espanh|spanish/.test(idioma)) raw.push("espanhol");
  else if (/franc/.test(idioma)) raw.push("francês");
  else if (idioma.trim().length >= 3) raw.push(idioma.trim());

  const capa = String(seed.tipoCapa || "");
  if (/dura/i.test(capa)) raw.push("capa dura");
  else if (/brochura|paperback/i.test(capa)) raw.push("brochura");

  const year = Number(
    String(seed.ano || "").match(/\d{4}/)?.[0] || Number(seed.ano) || 0,
  );
  if (year > 0 && year < 1970) raw.push("clássico");
  if (year >= 2000) raw.push("contemporâneo");

  const title = String(seed.titulo || "").toLowerCase();
  if (/mang[aá]|one piece|naruto|dragon ball/.test(title)) raw.push("mangá");
  if (/\bhq\b|quadrinhos|graphic novel/.test(title)) raw.push("quadrinhos");

  return processarTags(raw, { max: 10 });
}

/** Une várias fontes e deriva tags da ficha. */
export function enrichBookTags(
  sources: string[][],
  seed?: BookTagSeed,
  max = 18,
): string[] {
  const merged = processarTags(sources.flat(), { max: max + 6 });
  const derived = seed ? deriveTagsFromBook(seed) : [];
  return processarTags([...merged, ...derived], { max });
}
