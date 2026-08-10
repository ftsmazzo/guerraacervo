/** Tabela de tradução inglês → português (códigos BISAC comuns das APIs) */
export const TAGS_PT: Record<string, string> = {
  // Ficção
  fiction: "ficção",
  "literary fiction": "ficção literária",
  "science fiction": "ficção científica",
  fantasy: "fantasia",
  horror: "terror",
  thriller: "suspense",
  mystery: "mistério",
  romance: "romance",
  adventure: "aventura",
  "historical fiction": "ficção histórica",
  crime: "crime",
  detective: "detetive",
  "spy stories": "espionagem",
  dystopian: "distopia",
  utopian: "utopia",
  "magical realism": "realismo mágico",
  // Não-ficção
  "non-fiction": "não-ficção",
  nonfiction: "não-ficção",
  biography: "biografia",
  autobiography: "autobiografia",
  memoir: "memórias",
  "self-help": "autoajuda",
  "personal development": "desenvolvimento pessoal",
  business: "negócios",
  economics: "economia",
  history: "história",
  politics: "política",
  philosophy: "filosofia",
  psychology: "psicologia",
  science: "ciências",
  technology: "tecnologia",
  computers: "informática",
  mathematics: "matemática",
  medicine: "medicina",
  health: "saúde",
  cooking: "culinária",
  art: "arte",
  music: "música",
  sports: "esportes",
  travel: "viagem",
  nature: "natureza",
  religion: "religião",
  spirituality: "espiritualidade",
  education: "educação",
  law: "direito",
  "social science": "ciências sociais",
  linguistics: "linguística",
  "language arts": "linguagem",
  journalism: "jornalismo",
  // Infantil e jovem
  "juvenile fiction": "ficção infantil",
  "juvenile nonfiction": "não-ficção infantil",
  "children's books": "infantil",
  children: "infantil",
  "young adult": "jovem adulto",
  "picture books": "livros ilustrados",
  "middle grade": "literatura infanto-juvenil",
  // Formatos literários
  poetry: "poesia",
  drama: "drama",
  "short stories": "contos",
  essays: "ensaios",
  comics: "quadrinhos",
  "graphic novels": "romance gráfico",
  "graphic novel": "romance gráfico",
  humor: "humor",
  satire: "sátia",
  fable: "fábula",
  "fairy tales": "contos de fadas",
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
  // Classificações gerais
  classic: "clássico",
  classics: "clássicos",
  literature: "literatura",
  literary: "literário",
  bestseller: "best-seller",
  // Artes e entretenimento
  cinema: "cinema",
  theater: "teatro",
  photography: "fotografia",
  architecture: "arquitetura",
  crafts: "artesanato",
  gardening: "jardinagem",
  games: "jogos",
  hobbies: "hobbies",
  "cooking & food": "gastronomia",
};

export function traduzirTag(tag: string): string {
  const l = tag.toLowerCase().trim();
  if (TAGS_PT[l]) return TAGS_PT[l];
  for (const [en, pt] of Object.entries(TAGS_PT)) {
    if (l.includes(en)) return pt;
  }
  return tag;
}

export function processarTags(
  rawTags: string[],
  opts?: { dropUntranslatedEnglish?: boolean },
): string[] {
  const dropEn = opts?.dropUntranslatedEnglish !== false;
  const ptValues = new Set(Object.values(TAGS_PT));
  return [
    ...new Set(
      rawTags
        .flatMap((t) => t.split(/\s*[\/&,;]\s*/))
        .map((t) => traduzirTag(t.trim()))
        .map((t) => t.toLowerCase())
        .filter((t) => t.length >= 3 && t.length <= 40)
        .filter((t) => {
          if (!dropEn) return true;
          if (ptValues.has(t)) return true;
          if (/[áàâãäéêëíïóôõöúüç]/i.test(t)) return true;
          // sobrou inglês puro sem tradução → descarta
          if (/^[a-z][a-z0-9\s'-]*$/i.test(t)) return false;
          return true;
        }),
    ),
  ].slice(0, 12);
}
