const HEADERS = [
  'Co-signatories (order not normalized)',
  'Co-signatories',
  'Legislature',
  'Deposit number',
  'Deposit order',
  'Rectification',
  'Examining committee',
  'Target',
  'Lead signatory',
  'Date of deposit',
  'Amendment text',
  'Explanatory statement',
]

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11',
  decembre: '12', décembre: '12',
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeHeaderKey(raw) {
  const h = raw.trim().toLowerCase()
  if (h.startsWith('co-signatories')) return 'cosignataires'
  if (h.startsWith('legislature')) return 'legislature'
  if (h.startsWith('deposit number')) return 'depositNumber'
  if (h.startsWith('deposit order')) return 'depositOrder'
  if (h.startsWith('rectification')) return 'rectification'
  if (h.startsWith('examining committee')) return 'committee'
  if (h.startsWith('target')) return 'target'
  if (h.startsWith('lead signatory')) return 'leadSignatory'
  if (h.startsWith('date of deposit')) return 'dateDeposit'
  if (h.startsWith('amendment text')) return 'amendmentText'
  if (h.startsWith('explanatory statement')) return 'explanatoryStatement'
  return h
}

// Coupe le texte brut en sections { cléNormalisée: valeur } en se basant
// sur les en-têtes connus, qu'ils soient suivis de leur valeur sur la même
// ligne ("Target: Article 9") ou sur les lignes suivantes ("Target:\nArticle 15").
function splitSections(text) {
  const pattern = new RegExp(`^(${HEADERS.map(escapeRegex).join('|')})\\s*:?[ \\t]*(.*)$`, 'gmi')
  const matches = [...text.matchAll(pattern)]
  const sections = {}

  matches.forEach((m, i) => {
    const key = normalizeHeaderKey(m[1])
    const inline = (m[2] || '').trim()
    const start = m.index + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const block = text.slice(start, end).trim()
    const value = [inline, block].filter(Boolean).join('\n').trim()
    if (!(key in sections)) sections[key] = value
  })

  return sections
}

function parseDate(raw) {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/)
  if (!m) return null
  const [, day, monthName, year] = m
  const month = MONTHS[monthName.toLowerCase()]
  if (!month) return null
  return `${year}-${month}-${day.padStart(2, '0')}`
}

// Enlève la ligne "Article X" en doublon en tête du corps de l'amendement
// (elle est déjà capturée dans `article` via "Target:").
function cleanAmendmentText(raw, article) {
  if (!raw) return ''
  const lines = raw.split('\n')
  if (lines[0] && new RegExp(`^article\\s+${article}\\s*$`, 'i').test(lines[0].trim())) {
    lines.shift()
    while (lines.length && lines[0].trim() === '') lines.shift()
  }
  return lines.join('\n').trim()
}

// Heuristique de classification du point d'impact, alignée sur les 6 types
// gérés par ImpactBadge. Reste conservatrice : tout ce qui n'est pas
// clairement une suppression/réécriture/ajout d'article entier retombe
// sur 'point_restreint' (modification ciblée : remplacement, insertion
// ponctuelle, etc.).
function guessPointImpact(dispositif) {
  const t = dispositif.toLowerCase()

  const alineaMatch = dispositif.match(/alin[ée]a\s+(\d+)|paragraph\s+(\d+)/i)
  const alinea = alineaMatch ? (alineaMatch[1] || alineaMatch[2]) : null

  // Suppression complète de l'article
  if (/^supprimer\s+cet\s+article|^suppress(er)?\s+this\s+article|^delete\s+this\s+article/.test(t)) {
    return { type: 'suppression_article', alinea: null }
  }

  // Réécriture complète de l'article
  if (/r[ée]diger\s+ainsi\s+cet\s+article|rewrite\s+(the\s+)?(whole|entire)?\s*article|redraft\s+(the\s+)?article/.test(t)) {
    return { type: 'redaction_globale_article', alinea: null }
  }

  // Nouvel article additionnel (ex. "Après l'article 12, insérer un article additionnel")
  if (/apr[èe]s\s+l['’]article.*ins[ée]rer\s+un\s+article|after\s+article.*insert\s+(an\s+)?(additional\s+)?article/.test(t)) {
    return { type: 'article_entier', alinea: null }
  }

  // Suppression d'un alinéa précis
  if (/supprimer\s+l['’]alin[ée]a|delete\s+paragraph|suppress(er)?\s+paragraph/.test(t)) {
    return { type: 'suppression_alinea', alinea }
  }

  // Réécriture d'un alinéa précis
  if (/r[ée]diger\s+ainsi\s+l['’]alin[ée]a|rewrite\s+paragraph|redraft\s+paragraph/.test(t)) {
    return { type: 'redaction_globale_alinea', alinea }
  }

  // Par défaut : modification ciblée (remplacement, insertion ponctuelle...)
  return { type: 'point_restreint', alinea }
}

export function parseAmendmentTxt(text, filename = '') {
  const s = splitSections(text)

  const target = s.target || ''
  const articleMatch = target.match(/(\d+)/)
  const article = articleMatch ? articleMatch[1] : (target || '?')

  const leadSignatory = (s.leadSignatory || '').trim()
  const rapporteur = /rapporteur/i.test(leadSignatory)

  const cosignataires = (s.cosignataires || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const auteurs = [leadSignatory, ...cosignataires].filter(Boolean)

  const rectificationRaw = (s.rectification || '').trim()
  const rectification =
    rectificationRaw && !/^none$|^aucune$/i.test(rectificationRaw) ? rectificationRaw : null

  const dispositif = cleanAmendmentText(s.amendmentText || '', article)
  const expose_sommaire = (s.explanatoryStatement || '').trim()

  const depositNumber = (s.depositNumber || '').trim()
  const numero = depositNumber || filename.replace(/\.[^.]+$/, '')

  return {
    id: (depositNumber || `import-${Math.random().toString(36).slice(2, 9)}`).toLowerCase(),
    article,
    numero,
    rectification,
    date_depot: parseDate(s.dateDeposit),
    texte_examine: {
      titre: s.committee || null,
      lecture: null,
      numero_texte: null,
    },
    auteurs,
    rapporteur,
    avis_commission: null,
    avis_gouvernement: null,
    dispositif,
    expose_sommaire,
    point_impact: guessPointImpact(dispositif),
    categorie: null,
    resultat_ia: null,
  }
}