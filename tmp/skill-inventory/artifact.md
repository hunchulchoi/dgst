# Template execution contract

## Reference

- Retained source: `/Users/hunchulchoi/Downloads/푸른IT_스킬인벤토리.docx`
- SHA-256: `38e4ef8592f84c203114d70dd06667c17196165017125b21294157abcf928095`
- Render: 2 pages; page 1 portrait personal/career form, page 2 landscape project inventory.
- Evidence: `template-render/`, `evidence/style.json`, `evidence/package-sha256.txt`, and the section/content-control audits in the task log.
- Sections: 2. Content controls: none. Embedded media: none.

## Page system

- Section 1: A4 portrait 8.27 x 11.69 in; margins L 0.76, R 0.84, T/B 1.01 in.
- Section 2: A4 landscape 11.69 x 8.27 in; margins L 0.49, R 0.38, T/B 0.76 in.
- Each section starts on a new page. Headers/footers remain linked and empty. No first-page or odd/even variants.

## Typography and components

- Preserve the source's existing Normal/표준 단락 styles and direct run formatting. The source names 굴림체, but the final uses Arial Unicode MS as a metric-compatible Korean fallback because the bundled renderer cannot display 굴림체.
- Preserve all cell-level font size, bold, color, alignment, paragraph spacing, borders, fills, and row geometry. New values inherit the formatting of the exact destination cell; no generic preset is introduced.
- Preserve the bordered title blocks, yellow labels/headers, cyan date-entry accents, black grid borders, merged cells, and all section/page geometry.
- Existing labels and examples are replaced only where they are editable prompts or sample values. No new images, headers, footers, lists, numbering, fields, hyperlinks, footnotes, or endnotes are introduced.

## Editable slot map

- `word/document.xml`, table 1: name, birth year, sex, affiliation, experience, department, position, military period/rank, interview/start dates.
- Table 2: phone, email, GitHub/portfolio if supported, address.
- Table 3: high school/college history and up to three certifications.
- Table 4: four most recent career records.
- Table 5: two training records and five representative skills with proficiency.
- Table 6: inventory title only; preserve.
- Table 7: ten most recent/relevant project records across project, dates, client, employer, field, role, and environments.
- Unsupported fields (exact birth month/day, interview date, start date, GitHub URL) remain blank. Facts are not invented.

## Content flow and capacity

- Page 1 remains a dense, single-page personnel card. Use concise values sized to existing cells; no added rows.
- Page 2 remains a 10-row landscape skills matrix. Use compact line breaks only where they improve fit; no added rows or columns.
- All body content is inside the eight source tables; there are no meaningful body paragraphs outside the tables.

## Package preservation

- The source contains 15 package parts. `word/document.xml` and `docProps/core.xml` may change as a consequence of editing/saving.
- Preserve-only: relationships, styles, numbering, settings, theme, font table, web settings, footnotes, endnotes, app properties, thumbnail, content-types, and root relationships.
- Baseline path/size/SHA inventory is `evidence/package-sha256.txt`. No customXml, comments, drawings, controls, bookmarks, or external relationships exist.

## Fidelity gates

- The reference SHA must remain unchanged.
- Final output must retain two sections, A4 portrait then A4 landscape, the same table counts and row/column structures, fills, borders, merged cells, and recurring page furniture.
- Render every final page and inspect at 100% for clipping, overflow, overlap, broken Hangul glyphs, unexpected wrapping, and pagination drift.
- Compare package parts and allow only expected document/core-property changes. Use a reference/final render diff as a scope check.
