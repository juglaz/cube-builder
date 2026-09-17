import { isCreature, isLand } from './cardMeta'
import type { LibraryCard } from '../types'

/**
 * How a synergy-* / *-matters payoff is supported.
 *
 * cube          — distinctive package; count real enablers in the list
 * ambient       — true of almost any cube (colors, instants, “draw a card”); no floor
 * draft-basics  — land types; players add basics after drafting
 * ignore        — flavor, Un-sets, named cards/PWs, in-game state
 */
export type SynergySupport = 'cube' | 'ambient' | 'draft-basics' | 'ignore'

export type SynergySpec = {
  lane: string
  support: SynergySupport
  mode:
    | 'type-line'
    | 'land-type'
    | 'color'
    | 'keyword'
    | 'modified'
    | 'cmc'
    | 'oracle'
    | 'layout'
    | 'vanilla'
    | 'low-power'
    | 'tag'
    | 'none'
  typeAll?: string[]
  typeAny?: string[]
  landType?: string
  color?: 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'M' | 'mono' | 'hybrid' | 'pair' | 'trio'
  keyword?: string
  keywords?: string[]
  tagSlugs?: string[]
  oracleRe?: RegExp
  layouts?: string[]
  cmcMax?: number
  cmcMin?: number
  spellsOnly?: boolean
  memberNoun: string
}

const LAND_TYPES: Record<string, string> = {
  plains: 'Plains',
  island: 'Island',
  swamp: 'Swamp',
  mountain: 'Mountain',
  forest: 'Forest',
  wastes: 'Wastes',
  desert: 'Desert',
  gate: 'Gate',
  cave: 'Cave',
  locus: 'Locus',
  sphere: 'Sphere',
  town: 'Town',
  planet: 'Planet',
  'urza-s': "Urza's",
  "urza's": "Urza's",
}

/** Subtypes that are a real cube package, not Un-set / EDH-only. */
const PACKAGE_TYPES: Record<string, string> = {
  vehicle: 'Vehicle',
  equipment: 'Equipment',
  aura: 'Aura',
  saga: 'Saga',
  class: 'Class',
  case: 'Case',
  room: 'Room',
  omen: 'Omen',
  adventure: 'Adventure',
  curse: 'Curse',
  shrine: 'Shrine',
  spacecraft: 'Spacecraft',
  lesson: 'Lesson',
  planeswalker: 'Planeswalker',
  battle: 'Battle',
  arcane: 'Arcane',
  rune: 'Rune',
}

const AMBIENT_TYPES: Record<string, string> = {
  artifact: 'Artifact',
  enchantment: 'Enchantment',
  creature: 'Creature',
  land: 'Land',
  instant: 'Instant',
  sorcery: 'Sorcery',
  legendary: 'Legendary',
}

const COLORS: Record<string, NonNullable<SynergySpec['color']>> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
  colorless: 'C',
  colored: 'M',
  monocolor: 'mono',
  multicolor: 'M',
  hybrid: 'hybrid',
  'multicolor-pair': 'pair',
  'multicolor-trio': 'trio',
}

const KEYWORD_PACKAGES: Record<string, string[]> = {
  flying: ['flying'],
  haste: ['haste'],
  deathtouch: ['deathtouch'],
  defender: ['defender'],
  'double-strike': ['double strike'],
  'first-strike': ['first strike'],
  flash: ['flash'],
  hexproof: ['hexproof'],
  indestructible: ['indestructible'],
  lifelink: ['lifelink'],
  menace: ['menace'],
  reach: ['reach'],
  trample: ['trample'],
  vigilance: ['vigilance'],
  shadow: ['shadow'],
  shroud: ['shroud'],
  skulk: ['skulk'],
  landwalk: ['landwalk'],
  islandwalk: ['islandwalk'],
  wither: ['wither'],
  infect: ['infect'],
  toxic: ['toxic'],
  flashback: ['flashback'],
  cycling: ['cycling', 'basic landcycling'],
  kicker: ['kicker', 'multikicker'],
  cascade: ['cascade'],
  convoke: ['convoke'],
  madness: ['madness'],
  unearth: ['unearth'],
  proliferate: ['proliferate'],
  mentor: ['mentor'],
  backup: ['backup'],
  boast: ['boast'],
  dash: ['dash'],
  exploit: ['exploit'],
  explore: ['explore'],
  exert: ['exert'],
  enlist: ['enlist'],
  connive: ['connive'],
  disguise: ['disguise'],
  morph: ['morph', 'megamorph'],
  manifest: ['manifest'],
  'manifest-dread': ['manifest dread'],
  disturb: ['disturb'],
  mutate: ['mutate'],
  blitz: ['blitz'],
  ninjutsu: ['ninjutsu'],
  'jump-start': ['jump-start'],
  foretell: ['foretell'],
  plot: ['plot'],
  warp: ['warp'],
  suspend: ['suspend'],
  modular: ['modular'],
  soulbond: ['soulbond'],
  renown: ['renown'],
  embalm: ['embalm'],
  eternalize: ['eternalize'],
  devour: ['devour'],
  ingest: ['ingest'],
  affinity: ['affinity'],
  awaken: ['awaken'],
  bargain: ['bargain'],
  craft: ['craft'],
  discover: ['discover'],
  exhaust: ['exhaust'],
  forage: ['forage'],
  freerunning: ['freerunning'],
  goad: ['goad'],
  investigate: ['investigate'],
  saddle: ['saddle'],
  spectacle: ['spectacle'],
  suspect: ['suspect'],
  mill: ['mill'],
  scry: ['scry'],
  surveil: ['surveil'],
  changeling: ['changeling'],
  devoid: ['devoid'],
  'level-up': ['level up'],
  airbending: ['airbending'],
  earthbending: ['earthbending'],
  firebending: ['firebending'],
  waterbending: ['waterbending'],
  'cumulative-upkeep': ['cumulative upkeep'],
}

const IGNORE_UNSET = new Set([
  'ability-sticker',
  'art-sticker',
  'name-sticker',
  'p-t-sticker',
  'p/t-sticker',
  'sticker',
  'pin',
  'playtest',
  'banana',
  'dice',
  'augment',
  'attraction',
  'contraption',
  'bobblehead',
])

const IGNORE_EDH_FLAVOR_STATE = new Set([
  'commander',
  'partner',
  'background',
  'doctor-s-companion',
  "doctor's-companion",
  'villainous-choice',
  'tantrum',
  'speech',
  'art',
  'artist',
  'flavor',
  'flavor-text',
  'name',
  'clothing',
  'gender',
  'watermark',
  'set',
  'ip',
  'rarity',
  'border-color',
  'collector-number',
  'reminder-text',
  'rules-text',
  'location',
  'time',
  'table-order',
  'high-five',
  'ante',
  'draft',
  'format',
  'sideboard',
  'singleton',
  'team',
  'starting-player',
  'night',
  'card-style',
  'color-share',
  'color-non-share',
  'color-each',
  'color-every',
  'color-choose',
  'second-draw',
  'second-spell',
  'third-draw',
  'third-spell',
  'fourth-spell',
  'storm-count',
  'monarch',
  'attacking',
  'attacking-opponents',
  'blocker',
  'blocker-self',
  'solo-attack',
  'tapped',
  'untapped',
  'target',
  'full-hand',
  'hand-size',
  'top',
  'bottom-of-library',
  'library-size',
  'graveyard-order',
  'times-resolved',
  'amount-spent',
  'mana-spent',
  'color-spent',
  'mana-cost',
  'unspent-mana',
  'off-turn-casting',
  'age',
  'speed',
  'prepare',
  'phasing',
  'even-odd',
  'greatest-power',
  'specific-power',
  'specific-toughness',
  'x-cost',
  'high-x',
  'low-x',
  '1-1',
  'color-count',
  'commander-identity',
  'commander-tax',
  'recasting-commander',
  'leaving-graveyard',
  'discarded-type',
  'self-burn',
  'no-flying',
  'type-change',
  'power-up',
  'teamwork',
  'chorus',
  'clash',
  'vote',
  'plan',
  'role',
  'boon',
  'emblem',
  'initiative',
  'start-your-engines',
  'activated-ability',
  'banding',
  'horsemanship',
  'fear',
  'intimidate',
  'flanking',
  'bushido',
  'echo',
  'haunt',
  'gift',
  'conjure',
  'seek',
  'modal',
  'protection',
  'regenerate',
  'damage-prevention',
  'leaves-creature',
  'library-cast',
  'colorless-mana',
  'pw-choose',
])

function cube(
  lane: string,
  memberNoun: string,
  patch: Partial<SynergySpec>,
): SynergySpec {
  return { lane, support: 'cube', mode: 'none', memberNoun, ...patch }
}

function ambient(lane: string, memberNoun: string, patch: Partial<SynergySpec>): SynergySpec {
  return { lane, support: 'ambient', mode: 'none', memberNoun, ...patch }
}

function ignore(lane: string): SynergySpec {
  return { lane, support: 'ignore', mode: 'none', memberNoun: 'enablers' }
}

/** Named planeswalkers (synergy-pw-jace), namesake spells, other card-specific tags. */
export function isNamedCardTag(slug?: string, name?: string): boolean {
  const s = (slug ?? '').toLowerCase().trim()
  const n = (name ?? '').toLowerCase()
  if (!s && !n) return false
  if (/namesake/.test(s) || /namesake/.test(n)) return true
  if (/^impulse-pw-/.test(s)) return true
  if (/^synergy-pw-/.test(s) && s !== 'synergy-pw-choose') return true
  if (/(^|-)pw-[a-z]+$/.test(s) && !/pw-(choose|signature|hallmark|enhanced|enchantment)$/.test(s)) return true
  return false
}

export function synergySupportSpec(lane: string): SynergySpec {
  const l = lane.toLowerCase().trim().replace(/_/g, '-')

  if (isNamedCardTag(l) || isNamedCardTag(`synergy-${l}`)) return ignore(l)
  if (l.startsWith('pw-') || l.startsWith('sticker')) return ignore(l)
  if (IGNORE_UNSET.has(l) || IGNORE_EDH_FLAVOR_STATE.has(l)) return ignore(l)

  if (l === 'modified') {
    return cube(l, 'modified enablers (equipment, auras, counters)', { mode: 'modified' })
  }

  if (LAND_TYPES[l] || l === 'basic') {
    const typeName = l === 'basic' ? 'Basic' : LAND_TYPES[l]!
    return {
      lane: l,
      support: 'draft-basics',
      mode: 'land-type',
      landType: typeName,
      memberNoun: l === 'basic' ? 'basic lands added after the draft' : `${typeName}s added after the draft`,
    }
  }

  if (l === 'snow') return cube(l, 'Snow cards', { mode: 'type-line', typeAny: ['Snow'] })
  if (l === 'nonbasic-land') {
    return cube(l, 'nonbasic lands', { mode: 'type-line', typeAll: ['Land'] })
  }
  if (l === 'artifact-creature') {
    return cube(l, 'Artifact Creatures', { mode: 'type-line', typeAll: ['Artifact', 'Creature'] })
  }
  if (l === 'enchantment-creature') {
    return cube(l, 'Enchantment Creatures', { mode: 'type-line', typeAll: ['Enchantment', 'Creature'] })
  }
  if (l === 'creatureland') {
    return cube(l, 'creature lands', { mode: 'type-line', typeAll: ['Land', 'Creature'] })
  }
  if (l === 'equipment-legendary') {
    return cube(l, 'legendary Equipment', { mode: 'type-line', typeAll: ['Legendary', 'Equipment'] })
  }
  if (l === 'party') {
    return cube(l, 'Cleric, Rogue, Warrior, or Wizard creatures', {
      mode: 'type-line',
      typeAny: ['Cleric', 'Rogue', 'Warrior', 'Wizard'],
    })
  }
  if (PACKAGE_TYPES[l]) {
    const typeName = PACKAGE_TYPES[l]!
    return cube(l, `${typeName} type-line cards`, { mode: 'type-line', typeAny: [typeName] })
  }

  if (l === 'noncreature') {
    return ambient(l, 'noncreature cards', { mode: 'type-line' })
  }
  if (l === 'historic') {
    return ambient(l, 'historic cards', {
      mode: 'type-line',
      typeAny: ['Legendary', 'Artifact', 'Saga', 'Battle'],
    })
  }
  if (l === 'creature-count') return ambient(l, 'creatures', { mode: 'type-line', typeAny: ['Creature'] })
  if (l === 'land-count') return ambient(l, 'lands', { mode: 'type-line', typeAny: ['Land'] })
  if (AMBIENT_TYPES[l]) {
    const typeName = AMBIENT_TYPES[l]!
    return ambient(l, `${typeName} type-line cards`, { mode: 'type-line', typeAny: [typeName] })
  }

  if (l === 'low-mana-value') {
    return ambient(l, 'cheap nonlands (MV ≤ 2)', { mode: 'cmc', cmcMax: 2, spellsOnly: true })
  }
  if (l === 'high-mana-value') {
    return ambient(l, 'high-MV spells (MV ≥ 5)', { mode: 'cmc', cmcMin: 5, spellsOnly: true })
  }
  if (l === 'mana-value') {
    return ambient(l, 'nonlands', { mode: 'cmc', spellsOnly: true })
  }

  if (COLORS[l]) {
    return ambient(l, `${l} cards`, { mode: 'color', color: COLORS[l] })
  }

  if (l === 'token-creature') {
    return cube(l, 'creature-token makers', {
      mode: 'oracle',
      oracleRe: /create[s]?\b[\s\S]{0,100}\bcreature token/i,
    })
  }
  if (l === 'token') {
    return cube(l, 'token makers', { mode: 'oracle', oracleRe: /create[s]?\b[\s\S]{0,120}\btoken/i })
  }
  if (l === 'dungeon') {
    return cube(l, 'venture cards', { mode: 'oracle', oracleRe: /venture into the dungeon/i })
  }
  if (
    l === 'food' ||
    l === 'treasure' ||
    l === 'clue' ||
    l === 'blood' ||
    l === 'junk' ||
    l === 'powerstone' ||
    l === 'map' ||
    l === 'incubator' ||
    l === 'lander'
  ) {
    const kind = l.charAt(0).toUpperCase() + l.slice(1)
    return cube(l, `${kind} makers`, {
      mode: 'oracle',
      oracleRe: new RegExp(`(create[s]?\\b[\\s\\S]{0,80}\\b${kind}\\b|\\b${kind} token)`, 'i'),
    })
  }
  if (l === 'energy') {
    return cube(l, 'energy cards', { mode: 'oracle', oracleRe: /\benergy counters?\b/i })
  }
  if (l === 'poison') {
    return cube(l, 'poison/infect/toxic cards', {
      mode: 'oracle',
      oracleRe: /\b(poison counters?|infect|toxic)\b/i,
      keywords: ['infect', 'toxic', 'poisonous'],
    })
  }
  if (l === 'ring') {
    return cube(l, 'Ring-tempts cards', { mode: 'oracle', oracleRe: /the ring tempts you/i })
  }
  if (l === 'vanilla') return cube(l, 'vanilla creatures', { mode: 'vanilla' })
  if (l === 'low-power') return cube(l, 'low-power creatures (P ≤ 2)', { mode: 'low-power' })
  if (l === 'dfc' || l === 'transform') {
    return cube(l, 'double-faced cards', {
      mode: 'layout',
      layouts: ['transform', 'modal_dfc', 'modal-dfc', 'dfc', 'meld', 'double_faced_token'],
    })
  }
  if (l === 'face-down' || l === 'face-down-cast') {
    return cube(l, 'face-down enablers', {
      mode: 'keyword',
      keywords: ['morph', 'megamorph', 'manifest', 'manifest dread', 'disguise', 'cloak'],
    })
  }
  if (l === 'graveyard-cast') {
    return cube(l, 'cast-from-graveyard cards', {
      mode: 'keyword',
      keywords: ['flashback', 'unearth', 'escape', 'jump-start', 'disturb', 'aftermath'],
    })
  }
  if (l === 'exile-cast') {
    return cube(l, 'cast-from-exile cards', {
      mode: 'keyword',
      keywords: ['foretell', 'plot', 'impulse', 'warp', 'adventure'],
      oracleRe: /cast (?:this|it|that spell|a (?:copy|spell)).*exile|from exile/i,
    })
  }
  if (l === 'collect-evidence') {
    return cube(l, 'collect-evidence cards', { mode: 'oracle', oracleRe: /collect evidence/i })
  }
  if (l === 'fight') {
    return cube(l, 'fight cards', { mode: 'oracle', oracleRe: /\bfights?\b/i })
  }
  if (l === 'land-graveyard') {
    return cube(l, 'land-to-graveyard cards', {
      mode: 'oracle',
      oracleRe: /land card.*graveyard|sacrific(?:e|es) a land|puts? a land/i,
    })
  }
  if (l === 'bounce') {
    return cube(l, 'bounce spells', {
      mode: 'oracle',
      oracleRe: /return .* to (?:its|their) owner'?s? hand/i,
      tagSlugs: ['bounce'],
    })
  }
  if (l === 'copy') {
    return cube(l, 'copy effects', {
      mode: 'oracle',
      oracleRe: /\bcopy (?:of |target|it)\b|token that's a copy/i,
      tagSlugs: ['copy'],
    })
  }
  if (l === 'theft') {
    return cube(l, 'gain-control effects', {
      mode: 'oracle',
      oracleRe: /gain control of/i,
      tagSlugs: ['theft'],
    })
  }
  if (l === 'burn') {
    return cube(l, 'burn spells', {
      mode: 'oracle',
      oracleRe: /deals? \d+ damage to/i,
      tagSlugs: ['burn'],
    })
  }
  if (l === 'counterspell') {
    return cube(l, 'counterspells', {
      mode: 'oracle',
      oracleRe: /counter target (?:spell|ability)/i,
      tagSlugs: ['counterspell'],
    })
  }
  if (l === 'tutor') {
    return cube(l, 'tutors', {
      mode: 'oracle',
      oracleRe: /search your library for/i,
      tagSlugs: ['tutor'],
    })
  }
  if (l === 'sneak') {
    return cube(l, 'cheat-into-play effects', {
      mode: 'oracle',
      oracleRe: /put (?:it|that card|a creature) (?:onto|on) the battlefield/i,
      tagSlugs: ['sneak'],
    })
  }
  if (l === 'tuck') {
    return cube(l, 'tuck effects', {
      mode: 'oracle',
      oracleRe: /put .* (?:on|into) .* librar/i,
      tagSlugs: ['tuck'],
    })
  }
  if (l === 'reanimate') {
    return cube(l, 'reanimation', {
      mode: 'oracle',
      oracleRe: /return .* from (?:a |your )?graveyard to the battlefield/i,
    })
  }
  if (KEYWORD_PACKAGES[l]) {
    const words = KEYWORD_PACKAGES[l]!
    const verb =
      l === 'mill' ? /\bmills?\b/i : l === 'scry' ? /\bscry\b/i : l === 'surveil' ? /\bsurveil\b/i : undefined
    return cube(l, `cards with ${words[0]}`, {
      mode: 'keyword',
      keywords: words,
      tagSlugs: [l],
      oracleRe: verb,
    })
  }

  return ignore(l)
}

export function synergyLaneNeedsCubeSupport(lane: string): boolean {
  return synergySupportSpec(lane).support === 'cube'
}

function joinedTypeLine(card: LibraryCard): string {
  return [card.typeLine, ...(card.faces ?? []).map((face) => face.typeLine)].join(' ')
}

function joinedOracle(card: LibraryCard): string {
  if (card.faces?.length) return card.faces.map((face) => face.oracleText).join('\n')
  return card.oracleText
}

function hasKeyword(card: LibraryCard, keyword: string): boolean {
  const want = keyword.toLowerCase()
  return (card.keywords ?? []).some((word) => word.toLowerCase() === want)
}

export function cardMatchesSynergySpec(card: LibraryCard, spec: SynergySpec, tagSlugs?: Set<string>): boolean {
  if (spec.support !== 'cube' && spec.support !== 'ambient') return false
  if (spec.mode === 'modified' || spec.mode === 'none') return false
  if (spec.lane === 'noncreature') return !isCreature(card)
  if (spec.mode === 'vanilla') {
    return isCreature(card) && !(card.oracleText ?? '').trim() && (card.keywords ?? []).length === 0
  }
  if (spec.mode === 'low-power') {
    if (!isCreature(card) || card.power == null) return false
    const n = Number.parseInt(card.power, 10)
    return Number.isFinite(n) && n <= 2
  }
  if (spec.mode === 'layout') {
    const layout = (card.layout ?? '').toLowerCase().replace(/-/g, '_')
    if (spec.layouts?.some((item) => layout === item.replace(/-/g, '_'))) return true
    return Boolean(card.faces && card.faces.length > 1 && /transform|meld|modal/.test(layout))
  }
  if (spec.mode === 'type-line') {
    if (spec.lane === 'nonbasic-land') return isLand(card) && !/\bBasic\b/i.test(joinedTypeLine(card))
    const line = joinedTypeLine(card)
    if (spec.typeAll?.length) return spec.typeAll.every((token) => new RegExp(`\\b${token}\\b`, 'i').test(line))
    if (spec.typeAny?.length) return spec.typeAny.some((token) => new RegExp(`\\b${token}\\b`, 'i').test(line))
    return false
  }
  if (spec.mode === 'color') {
    const id = card.colorIdentity
    if (spec.color === 'C') return id.length === 0
    if (spec.color === 'mono') return id.length === 1
    if (spec.color === 'hybrid') return /\{[WUBRGC2]\/[WUBRGC]\}/.test(card.manaCost)
    if (spec.color === 'pair') return id.length === 2
    if (spec.color === 'trio') return id.length === 3
    if (spec.color === 'M') return spec.lane === 'colored' ? id.length > 0 : id.length >= 2
    return id.includes(spec.color ?? '')
  }
  if (spec.mode === 'keyword') {
    const words = spec.keywords ?? (spec.keyword ? [spec.keyword] : [])
    if (words.some((word) => hasKeyword(card, word))) return true
    if (spec.oracleRe && spec.oracleRe.test(joinedOracle(card))) return true
    if (spec.tagSlugs && tagSlugs) return spec.tagSlugs.some((slug) => tagSlugs.has(slug))
    return false
  }
  if (spec.mode === 'cmc') {
    if (spec.spellsOnly && isLand(card)) return false
    if (spec.cmcMax != null && card.cmc > spec.cmcMax) return false
    if (spec.cmcMin != null && card.cmc < spec.cmcMin) return false
    return true
  }
  if (spec.mode === 'oracle' && spec.oracleRe) {
    if (spec.oracleRe.test(joinedOracle(card))) return true
    if (spec.keywords?.some((word) => hasKeyword(card, word))) return true
    if (spec.tagSlugs && tagSlugs) return spec.tagSlugs.some((slug) => tagSlugs.has(slug))
    return false
  }
  if (spec.mode === 'tag' && spec.tagSlugs && tagSlugs) {
    return spec.tagSlugs.some((slug) => tagSlugs.has(slug))
  }
  return false
}
