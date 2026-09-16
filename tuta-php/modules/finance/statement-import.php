<?php
/**
 * Statement Importer — turn an M-Pesa / bank statement into expenses.
 *
 *   Step 1  upload  — pick source (M-Pesa / Bank) + a CSV export.
 *   Step 2  review  — we auto-map the columns and list every OUTGOING line
 *                     as a draft expense; the bursar just picks a category
 *                     (pre-filled from past choices) and unticks anything
 *                     that isn't an expense.
 *   Step 3  import  — ticked rows become real expenses (which auto-post to
 *                     the ledger), deduped so re-uploading can't double up.
 *
 * No PDF — CSV/Excel export only (Excel → Save As CSV).
 *
 * INCOMING lines are fee payments: each credit row is fuzzy-matched to a
 * student by admission number (reference column, then description tokens —
 * same fail-closed rules as the C2B matcher) and applied to their oldest
 * open invoice. No-match rows land in the manual reconciliation queue.
 * This is the collection path for BANK paybills (Co-op, Kingdom, Equity…)
 * where parents pay with the child's admission number as the reference.
 * Backing tables: imported_txns + statement_payee_rules (migration 091).
 */
$pageTitle = 'Import Statement';
require_once __DIR__ . '/../../includes/ledger.php';
require_once __DIR__ . '/../../includes/payment-reconcile.php';
$sb  = new Supabase();
$sid = schoolId();
initSession();

/* ── Column fields we try to find in the statement ───────────────── */
$ST_FIELDS = [
    'date'        => ['Date',        ['completion time','completed','transaction date','value date','date & time','trans time','trans date','date','posting date']],
    'description' => ['Description',  ['details','description','narration','transaction details','particulars','reason','remarks','transaction type','payee','to/from']],
    'money_out'   => ['Money out',   ['withdrawn','paid out','debit','money out','dr','amount out','withdrawal','out']],
    'money_in'    => ['Money in',    ['paid in','deposit','credit','money in','cr','amount in','in']],
    'amount'      => ['Amount',      ['amount','value','transaction amount','amount (kes)','amount kes']],
    'ref'         => ['Reference',   ['receipt no','receipt no.','receipt','reference','ref','transaction id','txn id','confirmation code','trans id','tran id']],
];

/* ── Helpers ─────────────────────────────────────────────────────── */

function st_norm(string $s): string {
    $s = preg_replace('/^\xEF\xBB\xBF/', '', $s);
    return preg_replace('/\s+/', ' ', strtolower(trim($s)));
}

/** Parse a money cell → float. Handles "1,200.00", "(500)", "-500", "KES 500". */
function st_num(string $raw): float {
    $raw = trim($raw);
    if ($raw === '') return 0.0;
    $neg = (strpos($raw, '(') !== false) || (strpos($raw, '-') !== false);
    $n = preg_replace('/[^0-9.]/', '', $raw);
    if ($n === '' || $n === '.') return 0.0;
    $v = (float)$n;
    return $neg ? -$v : $v;
}

/** Parse a statement date (may include a time) → Y-m-d, or null. */
function st_parse_date(string $raw, string $fmt): ?string {
    $raw = trim($raw);
    if ($raw === '') return null;
    $raw = preg_split('/[ T]/', $raw)[0];                 // drop any time portion
    $parts = preg_split('#[/\-.]+#', $raw);
    if (count($parts) === 3 && ctype_digit(implode('', $parts))) {
        [$a, $b, $c] = $parts;
        if (strlen($a) === 4)      { $y = $a; $m = $b; $d = $c; }   // yyyy-mm-dd
        elseif ($fmt === 'mdy')    { $m = $a; $d = $b; $y = $c; }
        elseif ($fmt === 'ymd')    { $y = $a; $m = $b; $d = $c; }
        else                       { $d = $a; $m = $b; $y = $c; }   // dmy default
        if (strlen($y) === 2) $y = '20' . $y;
        $y = (int)$y; $m = (int)$m; $d = (int)$d;
        if (checkdate($m, $d, $y)) return sprintf('%04d-%02d-%02d', $y, $m, $d);
        return null;
    }
    $ts = strtotime($raw);
    return $ts !== false ? date('Y-m-d', $ts) : null;
}

/** A stable key for a payee, so repeat payees auto-categorise. */
function st_payee_key(string $desc): string {
    $s = strtolower($desc);
    // strip common M-Pesa boilerplate + phone numbers + codes
    $s = preg_replace('/\b(customer|merchant|pay bill|paybill|till|buy goods|transfer|payment|to|from|online|acc\.?|account)\b/', ' ', $s);
    $s = preg_replace('/[0-9]+/', ' ', $s);               // drop digits (phones, amounts)
    $s = preg_replace('/[^a-z ]+/', ' ', $s);             // drop punctuation
    $s = preg_replace('/\s+/', ' ', trim($s));
    return substr($s, 0, 40);
}

/** A short human label for the payee (for the expense's vendor field). */
function st_payee_label(string $desc): string {
    $s = preg_replace('/\s+/', ' ', trim($desc));
    return substr($s, 0, 60);
}

/**
 * Read an uploaded CSV → [header, rows]. Skips M-Pesa preamble rows by
 * finding the first row that looks like a real column header.
 */
function st_read_csv(string $path): array {
    $raw = @file_get_contents($path);
    if ($raw === false) return ['error' => 'Could not read the uploaded file.'];
    if (substr($raw, 0, 4) === "PK\x03\x04") {
        return ['error' => 'This looks like an Excel file. Open it, choose File → Save As, pick "CSV", and upload that instead.'];
    }
    $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
    if (trim($raw) === '') return ['error' => 'The file is empty.'];

    $firstLine = strtok($raw, "\r\n");
    $counts = [',' => substr_count($firstLine, ','), ';' => substr_count($firstLine, ';'), "\t" => substr_count($firstLine, "\t")];
    arsort($counts);
    $delim = key($counts); if ($counts[$delim] === 0) $delim = ',';

    $fh = fopen('php://temp', 'r+'); fwrite($fh, $raw); rewind($fh);
    $all = [];
    while (($r = fgetcsv($fh, 0, $delim)) !== false) {
        if (count($r) === 1 && trim((string)$r[0]) === '') continue;
        $all[] = $r;
    }
    fclose($fh);
    if (!$all) return ['error' => 'The file has no readable rows.'];

    // Find the header row: the first row with >=2 recognisable statement columns.
    $keywords = ['date','completion','details','description','narration','withdrawn','paid in','paid out','debit','credit','amount','receipt','reference','balance','value'];
    $headerIdx = 0;
    foreach ($all as $i => $r) {
        $hits = 0;
        foreach ($r as $cell) {
            $c = st_norm((string)$cell);
            foreach ($keywords as $kw) if ($c !== '' && strpos($c, $kw) !== false) { $hits++; break; }
        }
        if ($hits >= 2) { $headerIdx = $i; break; }
    }
    $header = array_map(fn($h) => trim((string)$h), $all[$headerIdx]);
    $rows = array_slice($all, $headerIdx + 1);
    return ['header' => $header, 'rows' => $rows];
}

/** Auto-map statement columns → our fields. Each column claimed once. */
function st_auto_map(array $header, array $fields): array {
    $nh = array_map('st_norm', $header);
    $map = []; $used = [];
    foreach ($fields as $key => $def) {
        $cands = array_map('st_norm', array_merge([$def[0]], $def[1]));
        $found = null;
        foreach ($nh as $idx => $h) {
            if ($h === '' || in_array($idx, $used, true)) continue;
            foreach ($cands as $cand) {
                if ($h === $cand || strpos($h, $cand) !== false) { $found = $idx; break 2; }
            }
        }
        $map[$key] = $found;
        if ($found !== null) $used[] = $found;
    }
    return $map;
}

/**
 * Turn raw rows + mapping into transactions.
 * Each: [n, date, desc, ref, dir(out|in), amount, payee_key].
 */
function st_process(array $rows, array $map, string $fmt): array {
    $out = []; $n = 1;
    foreach ($rows as $r) {
        $n++;
        $g = fn($f) => ($map[$f] ?? null) === null ? '' : trim((string)($r[$map[$f]] ?? ''));
        $dateRaw = $g('date'); $desc = $g('description');
        if ($dateRaw === '' && $desc === '') continue;
        $date = st_parse_date($dateRaw, $fmt);

        $outV = $map['money_out'] !== null ? abs(st_num($g('money_out'))) : 0.0;
        $inV  = $map['money_in']  !== null ? abs(st_num($g('money_in')))  : 0.0;
        $amtV = $map['amount']    !== null ? st_num($g('amount'))         : 0.0;

        if ($outV > 0)      { $dir = 'out'; $amt = $outV; }
        elseif ($inV > 0)   { $dir = 'in';  $amt = $inV; }
        elseif ($amtV != 0) { $dir = $amtV < 0 ? 'out' : 'in'; $amt = abs($amtV); }
        else continue;      // zero-value / balance row

        $out[] = [
            'n' => $n, 'date' => $date, 'desc' => $desc, 'ref' => $g('ref'),
            'dir' => $dir, 'amount' => round($amt, 2), 'payee_key' => st_payee_key($desc),
        ];
    }
    return $out;
}

/* ── Incoming rows → fee payments: fuzzy student matching ────────── */

/**
 * The payer's phone, if the statement line carries one. Bank narratives for
 * M-Pesa credits look like "MPESA 254712345678 JANE WANJIRU" or
 * "M-PESA/0712 345 678/…"; M-Pesa Business statements have it in Details.
 * Returns 2547XXXXXXXX / 2541XXXXXXXX, or ''.
 */
function st_phone_in(array $t): string {
    $hay = (string)$t['desc'] . ' ' . (string)$t['ref'];
    $hay = preg_replace('/(?<=\d)[\s\-](?=\d)/', '', $hay);   // "0712 345 678" → "0712345678"
    if (preg_match('/(?<!\d)(?:\+?254|0)([17]\d{8})(?!\d)/', $hay, $m)) return '254' . $m[1];
    return '';
}

/** Build normalised admission-number lookup maps once per request. */
function st_roster_maps(Supabase $sb, string $sid): array {
    $students = Supabase::fetchAllPaged(fn($q) => $q->from('students')
        ->select('id,first_name,last_name,admission_number')
        ->eq('school_id', $sid)->eq('status', 'active'));
    $norm = []; $dig = [];
    foreach ($students as $s) {
        $adm = (string)($s['admission_number'] ?? '');
        if ($adm === '') continue;
        $n = strtolower(preg_replace('/[^a-z0-9]/i', '', $adm));
        $d = ltrim(preg_replace('/\D/', '', $adm), '0');
        if ($n !== '') $norm[$n][] = $s;
        if ($d !== '') $dig[$d][]  = $s;
    }
    return [$norm, $dig];
}

/**
 * Candidate references for one statement row: the reference column, then
 * description tokens that contain a digit — excluding the amount itself and
 * long pure-numeric strings (phone numbers, transaction ids).
 */
function st_ref_cands(array $t): array {
    $cands = [$t['ref']];
    foreach (preg_split('/[\s,\/;]+/', (string)$t['desc']) as $tok) {
        $tok = trim($tok, ".:#()'\"");
        if ($tok === '' || !preg_match('/\d/', $tok)) continue;
        if (preg_match('/^\d[\d,]*(\.\d+)?$/', $tok) && abs(st_num($tok) - (float)$t['amount']) < 0.01) continue;
        if (preg_match('/^\d{7,}$/', $tok)) continue;
        $cands[] = $tok;
    }
    return $cands;
}

/**
 * Match a credit row to exactly one student, or null. Fail-closed like the
 * C2B fuzzy matcher: normalised equality first, then digit-tail (3+ digits),
 * and any candidate that fits more than one student is refused.
 */
function st_match_student(array $maps, array $cands): ?array {
    [$norm, $dig] = $maps;
    $cands = array_values(array_unique(array_filter(array_map('trim', $cands))));
    foreach ($cands as $c) {
        $n = strtolower(preg_replace('/[^a-z0-9]/i', '', $c));
        if ($n !== '' && isset($norm[$n]) && count($norm[$n]) === 1) return $norm[$n][0];
    }
    foreach ($cands as $c) {
        $d = ltrim(preg_replace('/\D/', '', $c), '0');
        if (strlen($d) >= 3 && isset($dig[$d]) && count($dig[$d]) === 1) return $dig[$d][0];
    }
    return null;
}

/* ── Standard expense categories (offered when a school has none) ── */
$DEFAULT_CATS = [
    ['Salaries & Wages', '5000'], ['Rent', '5100'], ['Utilities', '5200'],
    ['Supplies & Materials', '5300'], ['Meals & Catering', '5400'],
    ['Transport', '5900'], ['Repairs & Maintenance', '5900'], ['General / Other', '5900'],
];

/* ── State machine ──────────────────────────────────────────────── */
$view = 'upload'; $error = ''; $importError = '';
$source = 'mpesa'; $dateFmt = 'auto'; $result = null;

if (isPost() && verifyCsrf()) {
    $step = $_POST['step'] ?? '';

    if ($step === 'seed_categories') {
        foreach ($DEFAULT_CATS as [$name, $code]) {
            $sb->from('expense_categories')->insert([
                'school_id' => $sid, 'name' => $name, 'account_code' => $code, 'is_active' => true,
            ]);
        }
        flash('success', 'Standard expense categories added.');
        redirect('finance/statement-import');
    }

    if ($step === 'upload') {
        $source = in_array($_POST['source'] ?? '', ['mpesa','bank'], true) ? $_POST['source'] : 'mpesa';
        if (!isset($_FILES['csv_file']) || $_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
            $error = 'File upload failed. Choose a CSV file and try again.';
        } else {
            $parsed = st_read_csv($_FILES['csv_file']['tmp_name']);
            if (isset($parsed['error'])) {
                $error = $parsed['error'];
            } elseif (count($parsed['rows']) === 0) {
                $error = 'No transaction rows found under the header.';
            } elseif (count($parsed['rows']) > 2000) {
                $error = 'This file has ' . count($parsed['rows']) . ' rows. Split it into files of 2000 rows or fewer.';
            } else {
                $_SESSION['stmt_import'] = [
                    'header' => $parsed['header'], 'rows' => $parsed['rows'],
                    'file' => $_FILES['csv_file']['name'] ?? 'statement.csv',
                    'source' => $source, 'map' => st_auto_map($parsed['header'], $ST_FIELDS),
                    'fmt' => 'auto',
                ];
                $view = 'review';
            }
        }
    } elseif ($step === 'review' || $step === 'import') {
        if (empty($_SESSION['stmt_import'])) {
            $error = 'Your upload expired. Please upload the statement again.';
        } else {
            // update mapping + options from the form
            foreach ($ST_FIELDS as $k => $_d) {
                $v = $_POST['map'][$k] ?? '';
                $_SESSION['stmt_import']['map'][$k] = ($v === '' ? null : (int)$v);
            }
            $_SESSION['stmt_import']['fmt'] = in_array($_POST['date_fmt'] ?? '', ['auto','dmy','mdy','ymd'], true) ? $_POST['date_fmt'] : 'auto';
            $source  = $_SESSION['stmt_import']['source'];
            $dateFmt = $_SESSION['stmt_import']['fmt'];
            $view = 'review';

            if ($step === 'import') {
                $map = $_SESSION['stmt_import']['map'];
                $txns = st_process($_SESSION['stmt_import']['rows'], $map, $dateFmt);
                $byN = []; foreach ($txns as $t) $byN[$t['n']] = $t;

                $inc = $_POST['inc'] ?? [];
                $cat = $_POST['cat'] ?? [];
                $payMethod = $source === 'bank' ? 'bank_transfer' : 'mpesa';

                // existing refs (dedup) for this school
                $existingRefs = [];
                foreach (Supabase::fetchAllPaged(fn($q) => $q->from('imported_txns')->select('txn_ref')->eq('school_id', $sid)) as $x) {
                    $existingRefs[$x['txn_ref']] = true;
                }

                $created = 0; $skippedDup = 0; $skippedNoCat = 0; $skippedBad = 0;
                foreach ($inc as $nStr => $_on) {
                    $n = (int)$nStr; $t = $byN[$n] ?? null;
                    if (!$t || $t['dir'] !== 'out') continue;
                    $catId = $cat[$nStr] ?? '';
                    if ($catId === '')       { $skippedNoCat++; continue; }
                    if (!$t['date'] || $t['amount'] <= 0) { $skippedBad++; continue; }
                    $ref = $t['ref'] !== '' ? $t['ref'] : substr(md5($t['date'] . '|' . $t['amount'] . '|' . $t['desc']), 0, 16);
                    if (isset($existingRefs[$ref])) { $skippedDup++; continue; }

                    $ins = $sb->from('expenses')->insert([
                        'school_id'      => $sid,
                        'description'    => $t['desc'] !== '' ? $t['desc'] : 'Statement import',
                        'amount'         => $t['amount'],
                        'expense_date'   => $t['date'],
                        'category_id'    => $catId,
                        'vendor_name'    => st_payee_label($t['desc']),
                        'invoice_number' => $t['ref'] ?: null,
                        'payment_method' => $payMethod,
                    ]);
                    if (!empty($ins['error'])) { $skippedBad++; continue; }
                    $expId = $ins['data'][0]['id'] ?? null;

                    $sb->from('imported_txns')->insert([
                        'school_id' => $sid, 'txn_ref' => $ref, 'expense_id' => $expId,
                        'source' => $source, 'amount' => $t['amount'], 'txn_date' => $t['date'],
                    ]);
                    $existingRefs[$ref] = true;

                    // remember payee → category for next time
                    if ($t['payee_key'] !== '') {
                        $exists = $sb->from('statement_payee_rules')->select('id')
                            ->eq('school_id', $sid)->eq('payee_key', $t['payee_key'])->single()->execute();
                        if (empty($exists['data'][0]['id'])) {
                            $sb->from('statement_payee_rules')->insert([
                                'school_id' => $sid, 'payee_key' => $t['payee_key'], 'category_id' => $catId,
                            ]);
                        }
                    }
                    $created++;
                }

                // ── Incoming rows ticked as fee payments ─────────
                $payCreated = $payQueued = $payDup = 0;
                $pin = $_POST['pin'] ?? [];
                if (!empty($pin)) {
                    $maps = st_roster_maps($sb, $sid);
                    foreach ($pin as $nStr => $_on) {
                        $n = (int)$nStr; $t = $byN[$n] ?? null;
                        if (!$t || $t['dir'] !== 'in') continue;
                        if (!$t['date'] || $t['amount'] <= 0) { $skippedBad++; continue; }
                        $ref = $t['ref'] !== '' ? $t['ref'] : substr(md5($t['date'] . '|' . $t['amount'] . '|' . $t['desc']), 0, 16);
                        if (isset($existingRefs[$ref])) { $payDup++; continue; }

                        $stu = st_match_student($maps, st_ref_cands($t));
                        $inv = null; $via = '';
                        if ($stu) {
                            $invR = $sb->from('invoices')->select('id')
                                ->eq('school_id', $sid)->eq('student_id', $stu['id'])
                                ->in('status', ['unpaid', 'partial'])->order('created_at')->limit(1)->execute();
                            $inv = ($invR['data'] ?? [])[0] ?? null;
                            if ($inv) $via = 'admission number';
                        }
                        // Bank paybills carry no admission number — fall back to the
                        // payer's phone against the guardians (fail-closed on ambiguity).
                        $phoneIn = st_phone_in($t);
                        if (!$inv && $phoneIn !== '') {
                            $inv = reconcileMatchInvoice($sb, $sid, ['account_ref' => '', 'phone' => $phoneIn]);
                            if ($inv) $via = 'payer phone';
                        }

                        if ($inv) {
                            $ap = reconcileApplyPayment($sb, $sid, $inv['id'], [
                                'amount' => $t['amount'], 'reference' => $ref,
                                'method' => $payMethod, 'paid_at' => $t['date'],
                                'actor'  => 'statement_import',
                            ]);
                            if (!empty($ap['ok'])) $payCreated++; else { $skippedBad++; continue; }
                        } else {
                            // Manual reconciliation queue (same screen as C2B unmatched).
                            $sb->from('mpesa_c2b_payments')->insert([
                                'school_id'   => $sid, 'trans_id' => $ref,
                                'amount'      => $t['amount'],
                                'bill_ref'    => $t['ref'] !== '' ? $t['ref'] : st_payee_label($t['desc']),
                                'payer_name'  => st_payee_label($t['desc']),
                                'status'      => 'unmatched',
                                'match_notes' => 'Statement import (' . $source . '): '
                                    . ($stu ? 'student matched but no open invoice' : ($phoneIn !== '' ? 'phone ' . $phoneIn . ' not on any one learner' : 'no admission number or phone on the line'))
                                    . ' — ' . mb_substr($t['desc'], 0, 120),
                                'raw_payload' => json_encode($t),
                            ]);
                            $payQueued++;
                        }

                        $sb->from('imported_txns')->insert([
                            'school_id' => $sid, 'txn_ref' => $ref, 'source' => $source,
                            'amount' => $t['amount'], 'txn_date' => $t['date'],
                        ]);
                        $existingRefs[$ref] = true;
                    }
                }

                auditLog('statement_import', 'expense', null, [
                    'created' => $created, 'payments' => $payCreated, 'queued' => $payQueued,
                    'source' => $source, 'file' => $_SESSION['stmt_import']['file'] ?? '',
                ]);
                $result = ['created' => $created, 'dup' => $skippedDup, 'nocat' => $skippedNoCat,
                           'bad' => $skippedBad, 'pay' => $payCreated, 'queued' => $payQueued, 'paydup' => $payDup];
                $view = 'result';
            }
        }
    }
}

/* ── Load categories + payee rules for the review screen ─────────── */
$categories = $sb->from('expense_categories')->select('id,name')
    ->eq('school_id', $sid)->eq('is_active', true)->order('name', true)->limit(300)->execute()['data'] ?? [];
$catById = []; foreach ($categories as $c) $catById[$c['id']] = $c['name'];
$payeeRules = [];
foreach ($sb->from('statement_payee_rules')->select('payee_key,category_id')->eq('school_id', $sid)->limit(1000)->execute()['data'] ?? [] as $pr) {
    $payeeRules[$pr['payee_key']] = $pr['category_id'];
}

$transactions = [];
$outCount = $inCount = 0;
if ($view === 'review' && !empty($_SESSION['stmt_import'])) {
    $S = $_SESSION['stmt_import'];
    $source = $S['source']; $dateFmt = $S['fmt'];
    $transactions = st_process($S['rows'], $S['map'], $dateFmt);
    foreach ($transactions as $t) { if ($t['dir'] === 'out') $outCount++; else $inCount++; }
    $stMaps = $inCount > 0 ? st_roster_maps($sb, $sid) : null;
    foreach ($transactions as &$t) {
        $t['suggest'] = $payeeRules[$t['payee_key']] ?? '';
        if ($t['dir'] === 'in' && $stMaps) {
            $stu = st_match_student($stMaps, st_ref_cands($t));
            $t['stu'] = $stu
                ? trim(($stu['first_name'] ?? '') . ' ' . ($stu['last_name'] ?? '')) . ' (' . ($stu['admission_number'] ?? '') . ')'
                : null;
            // No admission number on the line (bank paybills never have one):
            // show who the payer's phone belongs to, so the bursar can see the
            // match before importing.
            if (!$t['stu']) {
                $ph = st_phone_in($t);
                $pid = $ph !== '' ? reconcileStudentByPhone($sb, $sid, $ph) : null;
                if ($pid) {
                    $ps = $sb->from('students')->select('first_name,last_name,admission_number')->eq('id', $pid)->single()->execute()['data'][0] ?? null;
                    if ($ps) $t['stu'] = trim(($ps['first_name'] ?? '') . ' ' . ($ps['last_name'] ?? '')) . ' (' . ($ps['admission_number'] ?? '') . ') · via phone';
                }
            }
        }
    }
    unset($t);
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <a href="<?= baseUrl('finance/expenses') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Expenses</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Import a Statement</h1>
    <p class="text-sm text-gray-500 mt-1">Upload an M-Pesa or bank statement (CSV) — outgoing lines become expenses; incoming lines are matched to learners by admission number, or by the payer's phone when the statement has no reference (bank paybills), and posted as fee payments.</p>
</div>

<?php if ($error): ?><div class="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"><?= e($error) ?></div><?php endif; ?>

<?php if ($view === 'upload'): ?>
<!-- ═══ STEP 1 — UPLOAD ═══ -->
<div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-2xl">
    <div class="flex items-center gap-2 mb-4 text-xs text-gray-400 font-medium">
        <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">1. Upload</span>
        <span>&rarr;</span><span>2. Review &amp; categorize</span><span>&rarr;</span><span>3. Done</span>
    </div>
    <div class="mb-5 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
        <p class="font-medium mb-1">Where to get the file</p>
        <p><strong>M-Pesa:</strong> M-Pesa Business portal → Statements → export as Excel/CSV.
           <strong>Bank:</strong> online banking → download statement as CSV.
           If it's Excel, open it and <em>Save As → CSV</em> first. (No PDFs.)</p>
    </div>
    <form method="POST" enctype="multipart/form-data">
        <?= csrfField() ?>
        <input type="hidden" name="step" value="upload">
        <label class="block text-sm font-medium text-gray-700 mb-1">Statement source</label>
        <div class="flex gap-3 mb-4">
            <label class="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg cursor-pointer">
                <input type="radio" name="source" value="mpesa" checked class="text-emerald-600"> M-Pesa
            </label>
            <label class="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg cursor-pointer">
                <input type="radio" name="source" value="bank" class="text-emerald-600"> Bank
            </label>
        </div>
        <label class="block text-sm font-medium text-gray-700 mb-1">CSV file</label>
        <input type="file" name="csv_file" accept=".csv,text/csv" required
            class="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100">
        <button type="submit" class="mt-4 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Upload &amp; continue</button>
    </form>
</div>

<?php elseif ($view === 'review'): ?>
<!-- ═══ STEP 2 — REVIEW ═══ -->
<?php $S = $_SESSION['stmt_import']; $header = $S['header']; $map = $S['map']; ?>
<div class="flex items-center gap-2 mb-4 text-xs text-gray-400 font-medium">
    <span>1. Upload</span><span>&rarr;</span>
    <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">2. Review &amp; categorize</span>
    <span>&rarr;</span><span>3. Done</span>
</div>

<?php if (empty($categories)): ?>
    <div class="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center justify-between gap-4">
        <span>You have no expense categories yet — add the standard set so you can file these.</span>
        <form method="POST"><?= csrfField() ?><input type="hidden" name="step" value="seed_categories">
            <button class="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 whitespace-nowrap">Add standard categories</button>
        </form>
    </div>
<?php endif; ?>

<form method="POST">
    <?= csrfField() ?>
    <!-- Column mapping -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 class="text-base font-semibold text-gray-800">Columns from <span class="text-gray-500 font-normal"><?= e($S['file']) ?></span></h3>
            <label class="text-xs text-gray-500">Date format
                <select name="date_fmt" class="ml-1 px-2 py-1 border border-gray-200 rounded-lg text-xs">
                    <?php foreach (['auto'=>'Auto-detect','dmy'=>'D/M/Y','mdy'=>'M/D/Y','ymd'=>'Y-M-D'] as $k=>$lbl): ?>
                        <option value="<?= $k ?>" <?= $dateFmt===$k?'selected':'' ?>><?= $lbl ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <?php foreach ($ST_FIELDS as $key => $def): ?>
                <div>
                    <label class="block text-[11px] font-medium text-gray-600 mb-1"><?= e($def[0]) ?></label>
                    <select name="map[<?= $key ?>]" class="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white">
                        <option value="">— none —</option>
                        <?php foreach ($header as $idx => $col): ?>
                            <option value="<?= $idx ?>" <?= (string)($map[$key] ?? '')===(string)$idx?'selected':'' ?>><?= e($col !== '' ? $col : 'Col '.($idx+1)) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            <?php endforeach; ?>
        </div>
        <div class="mt-3 flex items-center gap-3">
            <button type="submit" name="step" value="review" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Re-read with these columns</button>
            <span class="text-xs text-gray-500"><strong><?= $outCount ?></strong> outgoing (expenses) · <strong><?= $inCount ?></strong> incoming (fee payments)</span>
        </div>
    </div>

    <!-- Outgoing transactions to categorize -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th class="px-3 py-2.5 font-medium"><input type="checkbox" id="chkAll" checked></th>
                    <th class="px-3 py-2.5 font-medium">Date</th>
                    <th class="px-3 py-2.5 font-medium">Description</th>
                    <th class="px-3 py-2.5 font-medium text-right">Amount</th>
                    <th class="px-3 py-2.5 font-medium">Category</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <?php $shown = 0; foreach ($transactions as $t): if ($t['dir'] !== 'out') continue; $shown++; if ($shown > 500) break; ?>
                    <tr class="hover:bg-gray-50 <?= !$t['date'] ? 'bg-red-50/30' : '' ?>">
                        <td class="px-3 py-2"><input type="checkbox" name="inc[<?= $t['n'] ?>]" value="1" class="rowchk" <?= $t['date'] ? 'checked' : '' ?>></td>
                        <td class="px-3 py-2 whitespace-nowrap text-gray-600"><?= $t['date'] ? e(date('j M Y', strtotime($t['date']))) : '<span class="text-red-500">bad date</span>' ?></td>
                        <td class="px-3 py-2 text-gray-800 max-w-[360px] truncate" title="<?= e($t['desc']) ?>"><?= e($t['desc']) ?: '<span class="text-gray-300">—</span>' ?></td>
                        <td class="px-3 py-2 text-right tabular-nums font-medium text-gray-800"><?= money($t['amount']) ?></td>
                        <td class="px-3 py-2">
                            <select name="cat[<?= $t['n'] ?>]" class="w-full max-w-[220px] px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white">
                                <option value="">— pick —</option>
                                <?php foreach ($categories as $c): ?>
                                    <option value="<?= e($c['id']) ?>" <?= $t['suggest']===$c['id']?'selected':'' ?>><?= e($c['name']) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if ($outCount === 0): ?>
                    <tr><td colspan="5" class="px-3 py-10 text-center text-gray-400">No outgoing transactions detected. Check the <strong>Money out</strong> / <strong>Amount</strong> column mapping above.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
        <?php if ($shown > 500): ?><p class="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-50">Showing the first 500 outgoing rows.</p><?php endif; ?>
    </div>

    <?php if ($inCount > 0): ?>
    <!-- Incoming transactions → fee payments -->
    <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mt-4">
        <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <h2 class="text-sm font-semibold text-gray-700">Incoming — fee payments (<?= $inCount ?>)</h2>
            <span class="text-[11px] text-gray-400">matched by admission number in the reference/description · unmatched go to the manual queue</span>
        </div>
        <table class="w-full text-sm">
            <thead><tr class="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th class="px-3 py-2 font-medium"><input type="checkbox" id="chkAllIn" checked></th>
                <th class="px-3 py-2 font-medium">Date</th>
                <th class="px-3 py-2 font-medium">Description</th>
                <th class="px-3 py-2 font-medium text-right">Amount</th>
                <th class="px-3 py-2 font-medium">Match</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
                <?php $shownIn = 0; foreach ($transactions as $t): if ($t['dir'] !== 'in') continue; $shownIn++; if ($shownIn > 500) break; ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-3 py-2"><input type="checkbox" class="rowchkin" name="pin[<?= (int)$t['n'] ?>]" checked></td>
                        <td class="px-3 py-2 text-gray-500 whitespace-nowrap"><?= e($t['date'] ?: '?') ?></td>
                        <td class="px-3 py-2 text-gray-700"><span class="block max-w-[300px] truncate" title="<?= e($t['desc']) ?>"><?= e($t['desc']) ?></span>
                            <?php if ($t['ref'] !== ''): ?><span class="text-[10px] text-gray-400 font-mono"><?= e($t['ref']) ?></span><?php endif; ?></td>
                        <td class="px-3 py-2 text-right tabular-nums text-emerald-700"><?= money($t['amount']) ?></td>
                        <td class="px-3 py-2">
                            <?php if (!empty($t['stu'])): ?>
                                <span class="inline-block text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">→ <?= e($t['stu']) ?></span>
                            <?php else: ?>
                                <span class="inline-block text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">manual queue</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php if ($shownIn > 500): ?><p class="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-50">Showing the first 500 incoming rows.</p><?php endif; ?>
    </div>
    <?php endif; ?>

    <div class="flex flex-wrap gap-3 mt-4">
        <button type="submit" name="step" value="import"
                onclick="return confirm('Import the ticked rows? Outgoing become expenses; incoming become fee payments.');"
                <?= ($outCount + $inCount) === 0 ? 'disabled' : '' ?>
                class="px-5 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition <?= ($outCount + $inCount) === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700' ?>">
            Import ticked rows
        </button>
        <a href="<?= baseUrl('finance/statement-import') ?>" class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Upload a different file</a>
    </div>
    <p class="text-xs text-gray-400 mt-2">Only ticked rows with a category are imported. Duplicates from a previous import are skipped automatically. Categories you pick are remembered for next time.</p>
</form>
<script>
  document.getElementById('chkAll')?.addEventListener('change', function(){
    document.querySelectorAll('.rowchk').forEach(c => c.checked = this.checked);
  });
  document.getElementById('chkAllIn')?.addEventListener('change', function(){
    document.querySelectorAll('.rowchkin').forEach(c => c.checked = this.checked);
  });
</script>

<?php elseif ($view === 'result'): ?>
<!-- ═══ STEP 3 — RESULT ═══ -->
<div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-xl">
    <div class="flex items-center gap-3 mb-2">
        <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        </div>
        <div>
            <h2 class="text-lg font-bold text-gray-900"><?= (int)$result['created'] ?> expense<?= $result['created']===1?'':'s' ?> · <?= (int)($result['pay'] ?? 0) ?> fee payment<?= ($result['pay'] ?? 0)===1?'':'s' ?> posted</h2>
            <p class="text-sm text-gray-500">
                <?php $skips = [];
                    if (!empty($result['queued'])) $skips[] = $result['queued'].' incoming sent to the manual queue';
                    if (!empty($result['paydup'])) $skips[] = $result['paydup'].' payments already imported';
                    if ($result['dup'])   $skips[] = $result['dup'].' expenses already imported';
                    if ($result['nocat']) $skips[] = $result['nocat'].' with no category';
                    if ($result['bad'])   $skips[] = $result['bad'].' skipped';
                    echo $skips ? e(implode(' · ', $skips)) : 'All good.'; ?>
            </p>
        </div>
    </div>
    <p class="text-sm text-gray-600 mt-3">Everything posted straight to the ledger. Expenses are in <a href="<?= baseUrl('finance/expenses') ?>" class="text-emerald-600 hover:underline font-medium">Expenses</a>; fee payments show on the students' invoices and in <a href="<?= baseUrl('finance/income-statement') ?>" class="text-emerald-600 hover:underline font-medium">Income &amp; Expenditure</a><?= !empty($result['queued']) ? ' — the queued rows are waiting in Settings → M-Pesa under unmatched payments' : '' ?>.</p>
    <div class="flex gap-3 mt-5">
        <a href="<?= baseUrl('finance/statement-import') ?>" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm">Import another</a>
        <a href="<?= baseUrl('finance/expenses') ?>" class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">View Expenses</a>
    </div>
</div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
