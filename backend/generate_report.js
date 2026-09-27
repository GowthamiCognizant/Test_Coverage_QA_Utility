const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  LevelFormat, VerticalAlign
} = require('docx');
const fs = require('fs');

// ── Data passed from Python via stdin ─────────────────────────────────────────
const analysis = JSON.parse(process.argv[2]);
const outputPath = process.argv[3];

const s               = analysis.summary || {};
const coveredTcs      = analysis.covered_tcs || [];
const uncoveredTcs    = analysis.uncovered_tcs || [];
const uncoveredFlows  = analysis.uncovered_flows || {};
const featureSummary  = analysis.feature_summary || {};
const meta            = analysis.meta || {};

const total       = s.total || 0;
const coveredCnt  = s.covered || 0;
const uncoveredCnt = s.uncovered || 0;
const pct         = s.coverage_pct || 0;
const modelUsed   = meta.model_used || 'Claude (Anthropic)';
const now         = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
const generatedCnt = Object.values(uncoveredFlows).reduce((a, v) => a + v.length, 0);

// ── Colours ────────────────────────────────────────────────────────────────────
const C = {
  darkBlue:  '1F3864',
  medBlue:   '2E4A7A',
  lightBlue: 'D1ECF1',
  green:     '155724',
  lightGreen:'D4EDDA',
  amber:     '856404',
  lightAmber:'FFF3CD',
  teal:      '0C5460',
  white:     'FFFFFF',
  grey:      'F8F9FA',
  borderGrey:'DEE2E6',
};

// ── Border helpers ─────────────────────────────────────────────────────────────
const b = (color='CCCCCC', size=4) => ({ style: BorderStyle.SINGLE, size, color });
const borders = (color='CCCCCC') => ({ top:b(color), bottom:b(color), left:b(color), right:b(color) });
const noBorders = () => {
  const n = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top:n, bottom:n, left:n, right:n };
};

// ── Cell helper ────────────────────────────────────────────────────────────────
function cell(children, { fill, width, bold, align, color, borderColor, noBorder: nb } = {}) {
  return new TableCell({
    borders: nb ? noBorders() : borders(borderColor || 'DEE2E6'),
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: Array.isArray(children) ? children : [children],
  });
}

// ── Text helper ────────────────────────────────────────────────────────────────
function txt(text, { bold=false, size=10, color='000000', italic=false }={}) {
  return new TextRun({ text: String(text), bold, size: size*2, color, italics: italic, font: 'Arial' });
}

function para(text, opts={}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before||0, after: opts.after||0 },
    children: Array.isArray(text) ? text : [txt(text, opts)],
  });
}

// ── STATUS badge cell ──────────────────────────────────────────────────────────
function statusCell(status, width=1000) {
  const cfg = {
    COVERED: { fill: C.lightGreen, color: C.green  },
    PARTIAL: { fill: C.lightAmber, color: C.amber  },
    NEW:     { fill: C.lightBlue,  color: C.teal   },
  };
  const c = cfg[status] || cfg.NEW;
  return cell(
    para(status, { bold:true, color: c.color, size:9, align: AlignmentType.CENTER }),
    { fill: c.fill, width, borderColor: C.borderGrey }
  );
}

// ── Build story rows ───────────────────────────────────────────────────────────
// Group covered TCs by feature file
const fileToTcs = {};
for (const tc of coveredTcs) {
  const f = tc.covered_by || 'unknown';
  (fileToTcs[f] = fileToTcs[f] || []).push(tc.key);
}

const storyRows = [];
let rowNum = 1;

// Covered stories
for (const [featFile, tcIds] of Object.entries(fileToTcs)) {
  const label = tcIds.slice(0,5).join(', ') + (tcIds.length > 5 ? ` +${tcIds.length-5} more` : '');
  storyRows.push({
    num: rowNum++,
    story: featFile.replace('.feature','').replace(/_/g,' '),
    tcIds: label,
    outputFiles: featFile,
    status: pct < 100 ? 'PARTIAL' : 'COVERED',
    c: tcIds.length, r: 0, n: 0,
  });
}

// Uncovered/new flow stories
for (const [flowName, tcs] of Object.entries(uncoveredFlows)) {
  const safe = flowName.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  storyRows.push({
    num: rowNum++,
    story: flowName,
    tcIds: 'None',
    outputFiles: `${safe}.feature + test_${safe}.py`,
    status: 'NEW',
    c: 0, r: 0, n: tcs.length,
  });
}

// ── DOCUMENT CHILDREN ─────────────────────────────────────────────────────────
const children = [];

// ── Title ─────────────────────────────────────────────────────────────────────
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 80 },
  children: [txt('Test Coverage Utility', { bold:true, size:9, color:'888888' })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 120 },
  children: [txt('Test Coverage Report', { bold:true, size:20, color: C.darkBlue })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 320 },
  children: [txt(`Generated: ${now}`, { size:9, color:'aaaaaa' })],
}));

// ── Stats bar (4-column table) ────────────────────────────────────────────────
const statCols = [2340, 2340, 2340, 2340];
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: statCols,
  rows: [
    new TableRow({ children: [
      cell([para('TOTAL TCs',  {bold:true,size:8,color:C.white,align:AlignmentType.CENTER}), para(String(total),  {bold:true,size:20,color:C.white,align:AlignmentType.CENTER})], { fill:C.darkBlue, width:statCols[0], borderColor:C.darkBlue }),
      cell([para('COVERED',    {bold:true,size:8,color:C.green,align:AlignmentType.CENTER}), para(String(coveredCnt),{bold:true,size:20,color:C.green,align:AlignmentType.CENTER})], { fill:C.lightGreen,width:statCols[1], borderColor:C.borderGrey }),
      cell([para('UNCOVERED',  {bold:true,size:8,color:C.amber,align:AlignmentType.CENTER}), para(String(uncoveredCnt),{bold:true,size:20,color:C.amber,align:AlignmentType.CENTER})], { fill:C.lightAmber,width:statCols[2], borderColor:C.borderGrey }),
      cell([para('NEW GENERATED',{bold:true,size:8,color:C.teal,align:AlignmentType.CENTER}), para(String(generatedCnt),{bold:true,size:20,color:C.teal,align:AlignmentType.CENTER})], { fill:C.lightBlue, width:statCols[3], borderColor:C.borderGrey }),
    ]}),
  ],
}));

children.push(new Paragraph({ spacing: { before:200, after:0 }, children:[] }));

// ── Coverage % bar (text representation) ─────────────────────────────────────
const barChar = '█';
const filledBars = Math.round(pct / 5);
const emptyBars  = 20 - filledBars;
const barColor   = pct >= 80 ? C.green : pct >= 50 ? C.amber : 'C0392B';

children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [9360],
  rows: [new TableRow({ children: [
    cell([
      new Paragraph({
        spacing: { before:60, after:60 },
        children: [
          txt('Coverage  ', { size:10, bold:true }),
          txt(barChar.repeat(filledBars), { size:12, color: barColor }),
          txt(barChar.repeat(emptyBars),  { size:12, color: 'DDDDDD' }),
          txt(`  ${pct}%`, { size:10, bold:true, color: barColor }),
        ],
      }),
    ], { fill: C.grey, borderColor: C.borderGrey }),
  ]})]
}));

children.push(new Paragraph({ spacing:{ before:240, after:0 }, children:[] }));

// ── Section heading helper ────────────────────────────────────────────────────
function sectionHeading(text) {
  return new Paragraph({
    spacing: { before:240, after:120 },
    border: { bottom: { style: BorderStyle.SINGLE, size:6, color: C.medBlue, space:2 } },
    children: [txt(text, { bold:true, size:13, color: C.darkBlue })],
  });
}

// ── Story-by-story table ──────────────────────────────────────────────────────
children.push(sectionHeading('Story-by-Story Coverage Breakdown'));

const storyCols = [360, 1800, 1800, 2400, 1000, 720, 1280];
// #, Story, TC IDs, Output Files, Status, C/R/N  — total = 9360

const storyHeaderRow = new TableRow({
  tableHeader: true,
  children: [
    cell(para('#',            {bold:true,color:C.white,size:9,align:AlignmentType.CENTER}), {fill:C.medBlue,width:storyCols[0],borderColor:C.medBlue}),
    cell(para('Story / Flow', {bold:true,color:C.white,size:9}), {fill:C.medBlue,width:storyCols[1],borderColor:C.medBlue}),
    cell(para('Existing Coverage (TC IDs)', {bold:true,color:C.white,size:9}), {fill:C.medBlue,width:storyCols[2],borderColor:C.medBlue}),
    cell(para('Output Files', {bold:true,color:C.white,size:9}), {fill:C.medBlue,width:storyCols[3],borderColor:C.medBlue}),
    cell(para('Status',       {bold:true,color:C.white,size:9,align:AlignmentType.CENTER}), {fill:C.medBlue,width:storyCols[4],borderColor:C.medBlue}),
    cell(para('C/R/N',        {bold:true,color:C.white,size:9,align:AlignmentType.CENTER}), {fill:C.medBlue,width:storyCols[5]+storyCols[6],borderColor:C.medBlue}),
  ],
});

const storyDataRows = storyRows.map((r, i) => {
  const fill = i % 2 === 0 ? C.white : C.grey;
  return new TableRow({
    children: [
      cell(para(String(r.num), {size:9,align:AlignmentType.CENTER}), {fill,width:storyCols[0]}),
      cell(para(r.story,       {size:9,bold:true}),                   {fill,width:storyCols[1]}),
      cell(para(r.tcIds,       {size:8,color:'555555'}),              {fill,width:storyCols[2]}),
      cell(para(r.outputFiles, {size:8,color:C.darkBlue}),            {fill,width:storyCols[3]}),
      statusCell(r.status, storyCols[4]),
      cell(para(`${r.c}/${r.r}/${r.n}`, {size:9,align:AlignmentType.CENTER,bold:true}), {fill,width:storyCols[5]+storyCols[6]}),
    ],
  });
});

// Legend row
const legendRow = new TableRow({ children: [
  cell(
    para('C = Covered  |  R = Removed/Infeasible  |  N = New Generated', {size:8,color:'888888',align:AlignmentType.CENTER}),
    { fill:C.grey, width:9360, borderColor:C.borderGrey }
  ),
]});

children.push(new Table({
  width: { size:9360, type:WidthType.DXA },
  columnWidths: [...storyCols.slice(0,-1), storyCols[5]+storyCols[6]],
  rows: [storyHeaderRow, ...storyDataRows, legendRow],
}));

children.push(new Paragraph({ spacing:{ before:280, after:0 }, children:[] }));

// ── Uncovered Flows detail ────────────────────────────────────────────────────
children.push(sectionHeading('Uncovered Flows — Detail'));

if (Object.keys(uncoveredFlows).length === 0) {
  children.push(para('All flows are covered ✓', { color: C.green, italic:true, size:10 }));
} else {
  const flowCols = [1400, 7960];
  const flowHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell(para('TC ID',      {bold:true,color:C.white,size:9}), {fill:C.medBlue,width:flowCols[0],borderColor:C.medBlue}),
      cell(para('Description',{bold:true,color:C.white,size:9}), {fill:C.medBlue,width:flowCols[1],borderColor:C.medBlue}),
    ],
  });

  const flowDataRows = [];
  let flowIdx = 0;
  for (const [flowName, tcs] of Object.entries(uncoveredFlows)) {
    // Flow group header row
    flowDataRows.push(new TableRow({ children: [
      cell(
        new Paragraph({
          spacing:{before:60,after:60},
          children:[txt(flowName,{bold:true,color:C.darkBlue,size:10}), txt(` (${tcs.length} TCs)`,{size:9,color:'888888'})],
        }),
        { fill:'EEF2F8', width:9360, borderColor:C.borderGrey }
      ),
    ]}));
    // TC rows
    for (let i=0; i<tcs.length; i++) {
      const fill = i % 2 === 0 ? C.white : C.grey;
      flowDataRows.push(new TableRow({ children: [
        cell(para(tcs[i].key||'', {size:9,bold:true,color:C.darkBlue}), {fill, width:flowCols[0]}),
        cell(para(tcs[i].summary||'', {size:9}),                         {fill, width:flowCols[1]}),
      ]}));
    }
    flowIdx++;
  }

  children.push(new Table({
    width: { size:9360, type:WidthType.DXA },
    columnWidths: flowCols,
    rows: [flowHeaderRow, ...flowDataRows],
  }));
}

children.push(new Paragraph({ spacing:{ before:280, after:0 }, children:[] }));

// ── Feature File Coverage ─────────────────────────────────────────────────────
children.push(sectionHeading('Feature File Coverage Summary'));

if (Object.keys(featureSummary).length === 0) {
  children.push(para('No feature files loaded', { color:'888888', italic:true, size:10 }));
} else {
  const featCols = [2400, 800, 6160];
  const featHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell(para('Feature File',   {bold:true,color:C.white,size:9}), {fill:C.medBlue,width:featCols[0],borderColor:C.medBlue}),
      cell(para('Scenarios',      {bold:true,color:C.white,size:9,align:AlignmentType.CENTER}), {fill:C.medBlue,width:featCols[1],borderColor:C.medBlue}),
      cell(para('Sample Scenarios',{bold:true,color:C.white,size:9}), {fill:C.medBlue,width:featCols[2],borderColor:C.medBlue}),
    ],
  });
  const featDataRows = Object.entries(featureSummary).map(([file, scenarios], i) => {
    const fill = i % 2 === 0 ? C.white : C.grey;
    const sample = scenarios.slice(0,3).join('; ') + (scenarios.length > 3 ? '...' : '');
    return new TableRow({ children: [
      cell(para(file,          {size:9,bold:true,color:C.darkBlue}), {fill,width:featCols[0]}),
      cell(para(String(scenarios.length), {size:9,align:AlignmentType.CENTER,bold:true}), {fill,width:featCols[1]}),
      cell(para(sample,        {size:8,color:'555555'}),              {fill,width:featCols[2]}),
    ]});
  });
  children.push(new Table({
    width: { size:9360, type:WidthType.DXA },
    columnWidths: featCols,
    rows: [featHeaderRow, ...featDataRows],
  }));
}

// ── Footer line ───────────────────────────────────────────────────────────────
// Footer removed per user request

// ── Assemble and write ─────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font:'Arial', size:20 } } },
  },
  sections: [{
    properties: {
      page: {
        size: { width:12240, height:15840 },
        margin: { top:1080, right:1080, bottom:1080, left:1080 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log('OK:' + outputPath);
}).catch(e => {
  console.error('ERROR:' + e.message);
  process.exit(1);
});