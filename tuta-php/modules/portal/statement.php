<?php
/**
 * Statement of Account — printable, branded ledger for ONE student.
 * Receives ?id=UUID (student id). Parent-scoped: a parent can only open a
 * student linked to them (parentStudent() enforces this).
 *
 * Shows every charge (invoice) and every payment in date order with a running
 * balance, plus a clear closing balance — the "updated statement of account"
 * parents ask for after each payment.
 */
requireParent();

$sb      = new Supabase();
$sid     = schoolId();
$childId = trim($_GET['id'] ?? '');
$student = $childId ? parentStudent($childId) : null;
if (!$student) { flash('error', 'That page is not available.'); redirect('portal'); }

$school = cachedSchool();

// ── Charges (issued invoices only — never drafts/cancelled) ──────────
$invRes = $sb->from('invoices')
    ->select('id,reference,amount,paid_amount,status,created_at')
    ->eq('student_id', $childId)->order('created_at')->execute();
$invoices = array_values(array_filter(($invRes['data'] ?? []),
    fn($i) => !in_array($i['status'] ?? '', ['draft', 'cancelled'], true)));
$invIds = array_column($invoices, 'id');

// ── Payments toward those invoices ───────────────────────────────────
$payments = [];
if (!empty($invIds)) {
    $pr = $sb->from('payments')
        ->select('id,invoice_id,amount,method,transaction_ref,paid_at,created_at,receipt_number,status')
        ->in('invoice_id', $invIds)->execute();
    $payments = array_values(array_filter(($pr['data'] ?? []),
        fn($p) => !in_array($p['status'] ?? 'completed', ['cancelled', 'voided'], true)));
}

// Applied credit notes (show why the bill changed)
$creditEvents = [];
$creditsByInvoice = [];
if (!empty($invIds)) {
    $cnRes = $sb->from('credit_notes')
        ->select('id,invoice_id,amount,credit_number,description,reason,reason_code,applied_at,created_at,status')
        ->in('invoice_id', $invIds)->eq('status', 'applied')->execute();
    foreach (($cnRes['data'] ?? []) as $cn) {
        $creditEvents[] = $cn;
        $iid = $cn['invoice_id'] ?? '';
        if ($iid !== '') {
            $creditsByInvoice[$iid] = ($creditsByInvoice[$iid] ?? 0) + (float)($cn['amount'] ?? 0);
        }
    }
}

$methodLabels = methodLabelMap();

// ── Build the ledger (charges + payments + credits, chronological) ──
// Invoice.amount is already net of applied credits, so reconstruct the
// original charge as amount + sum(applied credits) then list credits separately.
$events = [];
foreach ($invoices as $inv) {
    $cnSum = (float)($creditsByInvoice[$inv['id'] ?? ''] ?? 0);
    $gross = (float)($inv['amount'] ?? 0) + $cnSum;
    $events[] = ['ts'=>$inv['created_at'] ?? '', 'kind'=>'charge',
        'desc'=>'Invoice ' . ($inv['reference'] ?? ''), 'charge'=>$gross, 'credit'=>0.0];
}
foreach ($payments as $p) {
    $m = $methodLabels[$p['method'] ?? ''] ?? ucfirst((string)($p['method'] ?? 'Payment'));
    $ref = !empty($p['transaction_ref']) ? ' · ' . $p['transaction_ref'] : '';
    $events[] = ['ts'=>$p['paid_at'] ?: ($p['created_at'] ?? ''), 'kind'=>'payment',
        'desc'=>'Payment (' . $m . ')' . $ref, 'charge'=>0.0, 'credit'=>(float)$p['amount'],
        'receipt'=>$p['receipt_number'] ?? null, 'pid'=>$p['id']];
}
foreach ($creditEvents as $cn) {
    $label = $cn['description'] ?? $cn['reason'] ?? ('Credit note ' . ($cn['credit_number'] ?? ''));
    $events[] = ['ts'=>$cn['applied_at'] ?: ($cn['created_at'] ?? ''), 'kind'=>'credit_note',
        'desc'=>$label . (!empty($cn['credit_number']) ? ' · ' . $cn['credit_number'] : ''),
        'charge'=>0.0, 'credit'=>(float)$cn['amount']];
}
usort($events, fn($a, $b) => strcmp((string)$a['ts'], (string)$b['ts']));

$running = 0.0; $totalCharged = 0.0; $totalPaid = 0.0;
foreach ($events as &$e) {
    $running += $e['charge'] - $e['credit'];
    $e['balance'] = $running;
    $totalCharged += $e['charge'];
    $totalPaid    += $e['credit'];
}
unset($e);
$closing = $running;

// Credit on file (school owes the student) for completeness.
$studentCredit = (float)($student['credit_balance'] ?? 0);
if (!isset($student['credit_balance']) && !empty($student['id'])) {
    $cr = $sb->from('students')->select('credit_balance')->eq('id', $student['id'])->single()->execute();
    $studentCredit = (float)(($cr['data'][0]['credit_balance'] ?? 0));
}

$classMap  = cachedClassMap();
$className  = $classMap[$student['current_class_id'] ?? ''] ?? '';
$studentName = trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? ''));
$asAt = date('F j, Y');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Statement — <?= e($studentName) ?> — <?= e($school['name'] ?? 'School') ?></title>
    <link rel="stylesheet" href="/assets/tuta.css?v=1">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', system-ui, sans-serif; }
        @media print {
            .no-print { display: none !important; }
            body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-card { box-shadow: none !important; border: none !important; }
        }
        @page { margin: 12mm; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen flex items-start justify-center py-8 px-4">

    <div class="no-print fixed top-4 right-4 flex gap-3 z-50">
        <button onclick="window.print()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print / Save PDF
        </button>
        <button onclick="history.back()" class="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg shadow-lg font-medium border border-gray-200 transition text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back
        </button>
    </div>

    <div class="print-card bg-white w-full max-w-3xl rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">
        <?php
        $documentTitle  = 'STATEMENT OF ACCOUNT';
        $documentNumber = $student['admission_number'] ?? '';
        require __DIR__ . '/../../includes/print-header.php';
        ?>

        <div class="px-8 py-6 space-y-5">
            <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Account holder</h3>
                    <p class="text-gray-900 font-semibold"><?= e($studentName) ?></p>
                    <p class="text-sm text-gray-500"><?= e($className ?: 'Class not set') ?><?= !empty($student['admission_number']) ? ' · Adm ' . e($student['admission_number']) : '' ?></p>
                    <?php if (!empty($student['guardian_name'])): ?><p class="text-sm text-gray-500">Guardian: <?= e($student['guardian_name']) ?></p><?php endif; ?>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-400 uppercase tracking-wider">Statement date</p>
                    <p class="text-sm text-gray-800 font-medium"><?= e($asAt) ?></p>
                </div>
            </div>

            <!-- Ledger -->
            <div class="rounded-lg border border-gray-200 overflow-hidden">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
                            <th class="px-3 py-2.5 text-left font-semibold">Date</th>
                            <th class="px-3 py-2.5 text-left font-semibold">Description</th>
                            <th class="px-3 py-2.5 text-right font-semibold">Charge</th>
                            <th class="px-3 py-2.5 text-right font-semibold">Paid</th>
                            <th class="px-3 py-2.5 text-right font-semibold">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($events)): ?>
                            <tr><td colspan="5" class="px-3 py-6 text-center text-gray-400">No transactions yet.</td></tr>
                        <?php else: foreach ($events as $e): ?>
                            <tr class="border-t border-gray-100 <?= $e['kind'] === 'payment' ? 'bg-emerald-50/40' : '' ?>">
                                <td class="px-3 py-2.5 text-gray-500 whitespace-nowrap"><?= e($e['ts'] ? date('d M Y', strtotime($e['ts'])) : '—') ?></td>
                                <td class="px-3 py-2.5 text-gray-800"><?= e($e['desc']) ?></td>
                                <td class="px-3 py-2.5 text-right text-gray-700"><?= $e['charge'] > 0 ? money($e['charge']) : '' ?></td>
                                <td class="px-3 py-2.5 text-right text-emerald-700 font-medium"><?= $e['credit'] > 0 ? money($e['credit']) : '' ?></td>
                                <td class="px-3 py-2.5 text-right font-semibold <?= $e['balance'] > 0.005 ? 'text-gray-900' : 'text-emerald-600' ?>"><?= money($e['balance']) ?></td>
                            </tr>
                        <?php endforeach; endif; ?>
                    </tbody>
                    <tfoot>
                        <tr class="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                            <td class="px-3 py-3" colspan="2">Totals</td>
                            <td class="px-3 py-3 text-right"><?= money($totalCharged) ?></td>
                            <td class="px-3 py-3 text-right text-emerald-700"><?= money($totalPaid) ?></td>
                            <td class="px-3 py-3 text-right"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <!-- Closing balance callout -->
            <div class="rounded-lg p-4 flex items-center justify-between <?= $closing > 0.005 ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200' ?>">
                <div>
                    <p class="text-xs uppercase tracking-wider <?= $closing > 0.005 ? 'text-red-500' : 'text-emerald-600' ?>">Balance due as at <?= e($asAt) ?></p>
                    <p class="text-2xl font-bold mt-0.5 <?= $closing > 0.005 ? 'text-red-600' : 'text-emerald-600' ?>"><?= $closing > 0.005 ? money($closing) : 'Fully cleared' ?></p>
                </div>
                <?php if ($studentCredit > 0): ?>
                    <div class="text-right">
                        <p class="text-xs uppercase tracking-wider text-cyan-600">Credit on file</p>
                        <p class="text-lg font-bold text-cyan-700"><?= money($studentCredit) ?></p>
                    </div>
                <?php endif; ?>
            </div>

            <div class="text-center text-xs text-gray-400 space-y-1 pt-1">
                <p>This statement reflects all issued invoices and recorded payments to date.</p>
                <p>For enquiries, contact <?= e($school['phone'] ?? 'the school office') ?><?= !empty($school['email']) ? ' or ' . e($school['email']) : '' ?>.</p>
            </div>
        </div>
    </div>
</body>
</html>
