from pathlib import Path

p = Path('src/cloud/tests/runTournamentCreateImportTests.ts')
s = p.read_text()
s = s.replace(
    "import { buildTRFText } from '../../engine/trfParser';",
    "import { buildTRFText, setTrfField } from '../../engine/trfParser';"
)
old = """const trf = buildTRFText(trfSource, 26, 1);\nassert.equal(trf.ok, true, trf.errors.join(' '));\nconst importedTrf: any = importTrfText(trf.text, 'sample.trf');"""
new = """const trf = buildTRFText(trfSource, 26, 1);\nassert.equal(trf.ok, true, trf.errors.join(' '));\n// The exporter regression fixture is not a finalized-round fixture, so force the\n// two authoritative 001 round slots here. A complete TRF round slot occupies\n// columns 92..101; pad the physical line so parseTRF counts that slot.\nconst trfLines = trf.text.trimEnd().split(/\\r?\\n/).map(line => {\n  if (!line.startsWith('001')) return line;\n  line = line.padEnd(101, ' ');\n  const no = Number.parseInt(line.slice(4, 8), 10);\n  if (no === 1) {\n    line = setTrfField(line, 92, 4, '2', true);\n    line = setTrfField(line, 97, 1, 'w');\n    line = setTrfField(line, 99, 1, '1');\n  } else if (no === 2) {\n    line = setTrfField(line, 92, 4, '1', true);\n    line = setTrfField(line, 97, 1, 'b');\n    line = setTrfField(line, 99, 1, '0');\n  }\n  return line;\n});\nconst importedTrf: any = importTrfText(`${trfLines.join('\\r\\n')}\\r\\n`, 'sample.trf');"""
if old not in s:
    raise SystemExit('TRF fixture block not found')
s = s.replace(old, new, 1)
p.write_text(s)
