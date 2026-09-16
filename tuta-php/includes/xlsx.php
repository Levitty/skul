<?php
/**
 * Minimal .xlsx reader — no external library.
 *
 * An xlsx is a zip of XML, so ZipArchive + SimpleXML is enough to read one.
 * We only need values, never formatting, and mark sheets are small, so the
 * whole workbook is read into memory as strings.
 *
 * Dates are left as the raw serial number; mark sheets carry no dates in the
 * cells we care about, and guessing a format is worse than not guessing.
 */

const XLSX_NS     = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XLSX_NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** "BC12" → 54 (zero-based column index). */
function xlsxColIndex(string $ref): int
{
    if (!preg_match('/^([A-Z]+)/', $ref, $m)) return 0;
    $n = 0;
    foreach (str_split($m[1]) as $ch) $n = $n * 26 + (ord($ch) - 64);
    return $n - 1;
}

/**
 * Read a workbook.
 * Returns ['SheetName' => [ [cell, cell, …], … ], …] — every value a string.
 * Returns ['__error' => '…'] if the file cannot be opened.
 */
function xlsxLoad(string $path): array
{
    if (!is_readable($path)) return ['__error' => 'The file could not be read.'];

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        return ['__error' => 'That is not a readable .xlsx file.'];
    }

    $read = function (string $name) use ($zip) {
        $i = $zip->locateName($name, ZipArchive::FL_NOCASE);
        return $i === false ? null : $zip->getFromIndex($i);
    };

    // Shared strings: most text in a sheet is a pointer into this table.
    $shared = [];
    if ($xml = $read('xl/sharedStrings.xml')) {
        $sst = @simplexml_load_string($xml);
        if ($sst !== false) {
            foreach ($sst->children(XLSX_NS)->si as $si) {
                $txt = '';
                foreach ($si->xpath('.//*[local-name()="t"]') ?: [] as $t) $txt .= (string)$t;
                $shared[] = $txt;
            }
        }
    }

    // rId → the sheet's own xml path.
    $rels = [];
    if ($xml = $read('xl/_rels/workbook.xml.rels')) {
        $r = @simplexml_load_string($xml);
        if ($r !== false) {
            foreach ($r->children() as $rel) {
                $rels[(string)$rel['Id']] = (string)$rel['Target'];
            }
        }
    }

    $book = $read('xl/workbook.xml');
    if ($book === null) { $zip->close(); return ['__error' => 'The workbook is empty or damaged.']; }
    $wb = @simplexml_load_string($book);
    if ($wb === false) { $zip->close(); return ['__error' => 'The workbook could not be parsed.']; }

    $out = [];
    foreach ($wb->xpath('//*[local-name()="sheets"]/*[local-name()="sheet"]') ?: [] as $sheet) {
        $name  = (string)$sheet['name'];
        $rid   = (string)$sheet->attributes(XLSX_NS_REL)['id'];
        $tgt   = $rels[$rid] ?? '';
        if ($tgt === '') continue;
        $path2 = 'xl/' . ltrim(preg_replace('#^/?xl/#', '', $tgt), '/');

        $sxml = $read($path2);
        if ($sxml === null) continue;
        $sx = @simplexml_load_string($sxml);
        if ($sx === false) continue;

        $rows = [];
        foreach ($sx->xpath('//*[local-name()="row"]') ?: [] as $row) {
            $cells = [];
            foreach ($row->xpath('./*[local-name()="c"]') ?: [] as $c) {
                $type = (string)$c['t'];
                if ($type === 'inlineStr') {
                    $val = '';
                    foreach ($c->xpath('.//*[local-name()="t"]') ?: [] as $t) $val .= (string)$t;
                } else {
                    $v   = $c->xpath('./*[local-name()="v"]');
                    $raw = $v ? (string)$v[0] : '';
                    if ($type === 's') {
                        $val = ($raw !== '' && isset($shared[(int)$raw])) ? $shared[(int)$raw] : '';
                    } else {
                        $val = $raw;
                    }
                }
                $val = trim($val);
                if ($val !== '') $cells[xlsxColIndex((string)$c['r'])] = $val;
            }
            if ($cells) {
                $wide = max(array_keys($cells));
                $line = [];
                for ($i = 0; $i <= $wide; $i++) $line[] = $cells[$i] ?? '';
                $rows[] = $line;
            } else {
                $rows[] = [];
            }
        }
        $out[$name] = $rows;
    }

    $zip->close();
    return $out ?: ['__error' => 'No sheets were found in that file.'];
}

/**
 * Work out the structure of a Kenyan mark sheet.
 *
 * The sheet is self-describing: every subject is one or more raw-mark columns
 * followed by a percentage column, so the mark it is out of can be recovered
 * by division — 44 scored at 88% is out of 50. That means we never have to
 * trust the column headings, which is just as well: in Sabaki's Grade 4T the
 * Creative Arts pair is labelled the wrong way round.
 *
 * It is also self-checking. The sheet's own TOTAL is the sum of the subject
 * percentages that the school counts, so comparing our arithmetic to theirs
 * both validates the read and reveals which subjects are excluded (Sabaki
 * reports Computer and French but leaves them out of the average).
 *
 * Returns ['error' => …] or:
 *   ['name_col' => int, 'header_row' => int, 'title' => string,
 *    'subjects' => [ ['label','cols'=>[…],'pct_col'=>int,'max'=>float,'counts'=>bool], … ],
 *    'total_col' => ?int, 'pupils' => [ ['row'=>int,'name'=>string,'marks'=>[i=>float|null]], … ],
 *    'checked' => int, 'mismatched' => int]
 */
function xlsxDetectMarkSheet(array $rows): array
{
    // ── The header row is the one naming the pupil column. ──
    $headerRow = null; $nameCol = null;
    foreach (array_slice($rows, 0, 10, true) as $i => $r) {
        foreach ($r as $j => $cell) {
            if (stripos($cell, 'NAME') !== false) { $headerRow = $i; $nameCol = $j; break 2; }
        }
    }
    if ($headerRow === null) return ['error' => 'No column headed "NAME" was found in the first ten rows.'];

    $hdr   = $rows[$headerRow];
    $title = '';
    foreach (array_slice($rows, 0, $headerRow) as $r) {
        $line = trim(implode(' ', array_filter($r)));
        if ($line !== '') $title = $line;              // the last line above the header
    }

    // ── Where the marks stop. ──
    $totalCol = null; $stopCol = count($hdr);
    foreach ($hdr as $j => $cell) {
        if ($j <= $nameCol) continue;
        $u = strtoupper(trim($cell));
        if (in_array($u, ['TOTAL', 'TTL'], true))                 { $totalCol = $j; $stopCol = min($stopCol, $j); }
        if (in_array($u, ['AVG', 'AVERAGE', 'MEAN', 'GRD', 'GRADE', 'POS', 'POSITION', 'RANK'], true)) {
            $stopCol = min($stopCol, $j);
        }
    }

    // ── Pupil rows. ──
    $pupils = [];
    foreach ($rows as $i => $r) {
        if ($i <= $headerRow) continue;
        $nm = trim($r[$nameCol] ?? '');
        if ($nm === '') continue;
        if (preg_match('/^[\d.,\s%]+$/', $nm)) continue;                       // a stray number
        if (preg_match('/^(TOTAL|AVERAGE|MEAN|CLASS|SUBJECT)/i', $nm)) continue; // summary row
        // The stream letter sits in the column before the name ("STRM": L, C,
        // T, J, P). It is how the school already records which set a child is
        // in, so sections can be filled from the sheet rather than retyped.
        $stream = '';
        if ($nameCol > 0) {
            $s = strtoupper(trim($r[$nameCol - 1] ?? ''));
            if (strlen($s) === 1 && ctype_alpha($s)) $stream = $s;
        }
        $pupils[] = ['row' => $i, 'name' => $nm, 'stream' => $stream, 'cells' => $r];
    }
    if (!$pupils) return ['error' => 'No pupil rows were found under the header.'];

    $num = function ($v) {
        $v = trim((string)$v);
        if ($v === '') return null;
        $v = str_replace([',', '%', ' '], '', $v);
        return is_numeric($v) ? (float)$v : null;
    };

    // ── Which columns are percentages? ──
    // A percentage column sits to the right of at least one raw column, never
    // exceeds 100, and divides into the run of raw marks to its left to give
    // one consistent "out of" across the class.
    $subjects = []; $runStart = $nameCol + 1;
    for ($j = $nameCol + 1; $j < $stopCol; $j++) {
        $maxes = []; $sane = true;
        foreach ($pupils as $p) {
            $pct = $num($p['cells'][$j] ?? null);
            if ($pct === null) continue;
            if ($pct < 0 || $pct > 100.5) { $sane = false; break; }
            $sum = 0; $any = false;
            for ($k = $runStart; $k < $j; $k++) {
                $raw = $num($p['cells'][$k] ?? null);
                if ($raw !== null) { $sum += $raw; $any = true; }
            }
            if (!$any || $pct <= 0) continue;
            $maxes[] = round($sum / ($pct / 100), 1);
        }
        if (!$sane || count($maxes) < 3 || $j === $runStart) continue;

        // The class should agree on the mark each subject is out of.
        $counts = array_count_values(array_map('strval', $maxes));
        arsort($counts);
        $best  = (float)array_key_first($counts);
        $agree = reset($counts) / count($maxes);
        if ($agree < 0.6 || $best < 1 || $best > 500) continue;

        $label = '';
        for ($k = $runStart; $k < $j; $k++) {
            $h = trim($hdr[$k] ?? '');
            if ($h !== '' && $h !== '%') { $label = $h; break; }
        }
        // "C/A %" is a raw-mark column mislabelled with a percent sign.
        $label = trim(preg_replace('/\s*%\s*$/', '', $label));
        if ($label === '' || $label === '%') $label = 'Column ' . ($j + 1);

        $subjects[] = [
            'label'   => $label,
            'cols'    => range($runStart, $j - 1),
            'pct_col' => $j,
            'max'     => round($best, 2),
            'counts'  => true,
        ];
        $runStart = $j + 1;
    }
    if (!$subjects) return ['error' => 'No subject columns could be identified on this sheet.'];

    // ── Which subjects the school counts, read from its own TOTAL. ──
    // Sabaki's total is the sum of the first eight subject percentages; Computer
    // and French are reported but excluded. Trust the sheet, not an assumption.
    if ($totalCol !== null) {
        $pctOf = function (array $p, array $s) use ($num) {
            $sum = 0; $any = false;
            foreach ($s['cols'] as $k) {
                $raw = $num($p['cells'][$k] ?? null);
                if ($raw !== null) { $sum += $raw; $any = true; }
            }
            return $any && $s['max'] > 0 ? ($sum / $s['max']) * 100 : null;
        };
        $bestKeep = count($subjects); $bestHits = -1;
        for ($keep = count($subjects); $keep >= 1; $keep--) {
            $hits = 0; $seen = 0;
            foreach ($pupils as $p) {
                $declared = $num($p['cells'][$totalCol] ?? null);
                if ($declared === null) continue;
                $seen++;
                $sum = 0;
                for ($s = 0; $s < $keep; $s++) {
                    $v = $pctOf($p, $subjects[$s]);
                    if ($v !== null) $sum += $v;
                }
                if (abs($sum - $declared) < 0.5) $hits++;
            }
            if ($seen && $hits > $bestHits) { $bestHits = $hits; $bestKeep = $keep; }
            if ($seen && $hits === $seen) break;         // exact agreement, stop
        }
        for ($s = 0; $s < count($subjects); $s++) $subjects[$s]['counts'] = ($s < $bestKeep);
    }

    // ── Each pupil's raw mark per subject. ──
    $checked = 0; $mismatched = 0;
    foreach ($pupils as $idx => $p) {
        $marks = [];
        foreach ($subjects as $si => $s) {
            $sum = 0; $any = false;
            foreach ($s['cols'] as $k) {
                $raw = $num($p['cells'][$k] ?? null);
                if ($raw !== null) { $sum += $raw; $any = true; }
            }
            $marks[$si] = $any ? round($sum, 2) : null;
            if ($any && $sum > $s['max'] + 0.01) $mismatched++;
            if ($any) $checked++;
        }
        $pupils[$idx]['marks'] = $marks;
        unset($pupils[$idx]['cells']);
    }

    // Which streams appear on this sheet, commonest first. Usually exactly one.
    $streams = [];
    foreach ($pupils as $p) {
        if ($p['stream'] !== '') $streams[$p['stream']] = ($streams[$p['stream']] ?? 0) + 1;
    }
    arsort($streams);

    return [
        'header_row' => $headerRow,
        'name_col'   => $nameCol,
        'streams'    => $streams,
        'title'      => $title,
        'subjects'   => $subjects,
        'total_col'  => $totalCol,
        'pupils'     => array_values($pupils),
        'checked'    => $checked,
        'mismatched' => $mismatched,
    ];
}
