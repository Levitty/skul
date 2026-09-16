<?php
/**
 * Family Invoices — consolidated view of all invoices for a family.
 * Search by Family ID or student name. Pay across multiple sibling invoices in one go.
 */
$pageTitle = 'Family Invoices';
$sb  = new Supabase();
$sid = schoolId();

$classMap = cachedClassMap();

// ── Handle family payment (POST) ────────────────────────────
// Each allocation becomes one record_payment RPC call. The RPC handles
// race conditions, dup-ref checks, status transitions, audit logging,
// and overpayment-to-credit. We just orchestrate the loop here.
if (isPost() && verifyCsrf()) {
    $totalAmount = (float)input('total_amount');
    $method      = input('method') ?: 'cash';
    $transRef    = trim(input('transaction_ref'));
    $date        = input('payment_date') ?: date('Y-m-d');
    $familyId    = input('family_id');
    $allocations = $_POST['allocations'] ?? []; // invoice_id => amount

    if ($totalAmount <= 0) {
        flash('error', 'Please enter a valid payment amount.');
        redirect('fees/family?q=' . urlencode($familyId));
    }
    if ($transRef === '') {
        flash('error', 'A reference or receipt number is required for every payment.');
        redirect('fees/family?q=' . urlencode($familyId));
    }

    // Filter to non-zero allocations
    $validAllocations = [];
    foreach ($allocations as $invId => $amt) {
        $amt = (float)$amt;
        if ($amt > 0) $validAllocations[$invId] = $amt;
    }

    if (empty($validAllocations)) {
        flash('error', 'Please allocate the payment to at least one invoice.');
        redirect('fees/family?q=' . urlencode($familyId));
    }

    $paymentsMade     = 0;
    $totalOverpayment = 0.0;
    $firstPaymentId   = null;
    $errors           = [];

    foreach (array_values($validAllocations) as $idx => $payAmount) {
        $invoiceId = array_keys($validAllocations)[$idx];

        // For multi-invoice family payments, suffix the txn_ref so each row
        // is uniquely linkable while remaining traceable to the original.
        $refForThis = null;
        if ($transRef !== '') {
            $refForThis = count($validAllocations) === 1
                ? $transRef
                : $transRef . '-' . ($idx + 1);
        }

        $result = recordInvoicePayment($invoiceId, $payAmount, $method, $refForThis, $date);

        if (!$result['success']) {
            $errors[] = $result['error'];
            continue;
        }

        if (!$firstPaymentId) $firstPaymentId = $result['payment_id'];
        $totalOverpayment += $result['overpayment'];
        $paymentsMade++;
    }

    if ($paymentsMade === 0) {
        flash('error', 'No payments could be processed: ' . ($errors[0] ?? 'unknown error'));
        redirect('fees/family?q=' . urlencode($familyId));
    }

    // Stay on the family page so the user sees the updated balances side-by-side.
    // The receipt for the first payment is one click away via the flash link.
    $msg = 'Family payment of ' . money($totalAmount) . ' recorded across '
         . $paymentsMade . ' invoice(s).';
    if ($totalOverpayment > 0) {
        $msg .= ' ' . money($totalOverpayment) . ' overpayment added to the family\'s credit balance.';
    }
    if (!empty($errors)) {
        $msg .= ' Note: ' . count($errors) . ' allocation(s) failed.';
    }

    if ($firstPaymentId) {
        flashLink('success', $msg,
            baseUrl('fees/receipt?id=' . $firstPaymentId),
            'View First Receipt');
    } else {
        flash('success', $msg);
    }
    redirect('fees/family?q=' . urlencode($familyId));
}

// ── Search / load family ────────────────────────────────────
$searchQuery = trim(input('q'));
$familyStudents = [];
$familyInvoices = [];
$familyId = '';

if ($searchQuery) {
    // Try as family_id first
    $stuResult = $sb->from('students')
        ->select('id,first_name,last_name,admission_number,current_class_id,family_id,credit_balance,guardian_name,guardian_phone')
        ->eq('school_id', $sid)->eq('status', 'active')
        ->eq('family_id', $searchQuery)
        ->order('first_name')
        ->execute();
    $familyStudents = $stuResult['data'] ?? [];
    $familyId = $searchQuery;

    // If no match, search by student name
    if (empty($familyStudents)) {
        $stuResult = $sb->from('students')
            ->select('id,first_name,last_name,admission_number,current_class_id,family_id,credit_balance,guardian_name,guardian_phone')
            ->eq('school_id', $sid)->eq('status', 'active')
            ->ilike('first_name', '%' . $searchQuery . '%')
            ->order('first_name')
            ->execute();
        $matchedStudents = $stuResult['data'] ?? [];

        // If a matched student has a family_id, load their full family
        foreach ($matchedStudents as $ms) {
            if (!empty($ms['family_id'])) {
                $famResult = $sb->from('students')
                    ->select('id,first_name,last_name,admission_number,current_class_id,family_id,credit_balance,guardian_name,guardian_phone')
                    ->eq('school_id', $sid)->eq('status', 'active')
                    ->eq('family_id', $ms['family_id'])
                    ->order('first_name')
                    ->execute();
                $familyStudents = $famResult['data'] ?? [];
                $familyId = $ms['family_id'];
                break;
            }
        }

        // If still nothing, show the matched students individually
        if (empty($familyStudents) && !empty($matchedStudents)) {
            $familyStudents = $matchedStudents;
        }
    }

    // Load outstanding invoices for these students
    if (!empty($familyStudents)) {
        $studentIds = array_column($familyStudents, 'id');
        $invResult = $sb->from('invoices')
            ->select('id,reference,student_id,amount,paid_amount,credit_applied,status,due_date,created_at')
            ->eq('school_id', $sid)
            ->in('student_id', $studentIds)
            ->in('status', ['unpaid', 'partial'])
            ->order('created_at', false)
            ->execute();
        $familyInvoices = $invResult['data'] ?? [];
    }
}

// Build student lookup
$studentLookup = [];
foreach ($familyStudents as $s) {
    $studentLookup[$s['id']] = $s;
}

$totalFamilyBalance = 0;
$totalFamilyCredit  = 0;
foreach ($familyInvoices as $inv) {
    $totalFamilyBalance += ((float)($inv['amount'] ?? 0)) - ((float)($inv['paid_amount'] ?? 0));
}
foreach ($familyStudents as $s) {
    $totalFamilyCredit += (float)($s['credit_balance'] ?? 0);
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Family Invoices</h1>
        <p class="text-sm text-gray-500 mt-1">View and pay sibling invoices together</p>
    </div>
</div>

<!-- Search -->
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <form method="GET" action="<?= baseUrl('fees/family') ?>" class="flex items-center gap-3">
        <label class="text-sm font-medium text-gray-600 whitespace-nowrap">Search:</label>
        <input type="text" name="q" value="<?= e($searchQuery) ?>" placeholder="Family ID (e.g. FAM-001) or student name" class="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm" autofocus>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Search</button>
    </form>
</div>

<?php if ($searchQuery && !empty($familyStudents)): ?>

    <!-- Family Summary -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Family</p>
            <p class="text-lg font-bold text-gray-900 mt-1"><?= e($familyId ?: 'No Family ID') ?></p>
            <p class="text-xs text-gray-500 mt-0.5"><?= count($familyStudents) ?> student<?= count($familyStudents) !== 1 ? 's' : '' ?></p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Balance</p>
            <p class="text-lg font-bold <?= $totalFamilyBalance > 0 ? 'text-red-600' : 'text-gray-900' ?> mt-1"><?= money($totalFamilyBalance) ?></p>
            <p class="text-xs text-gray-500 mt-0.5"><?= count($familyInvoices) ?> outstanding invoice<?= count($familyInvoices) !== 1 ? 's' : '' ?></p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Credit Balance</p>
            <p class="text-lg font-bold <?= $totalFamilyCredit > 0 ? 'text-emerald-600' : 'text-gray-900' ?> mt-1"><?= money($totalFamilyCredit) ?></p>
            <p class="text-xs text-gray-500 mt-0.5">From overpayments</p>
        </div>
    </div>

    <!-- Students in family -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Family Members</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <?php foreach ($familyStudents as $fs): ?>
                <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                    <div class="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm flex-shrink-0">
                        <?= strtoupper(substr($fs['first_name'], 0, 1)) ?>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-gray-900 truncate"><?= e($fs['first_name'] . ' ' . $fs['last_name']) ?></p>
                        <p class="text-xs text-gray-500"><?= e($classMap[$fs['current_class_id'] ?? ''] ?? '') ?> &middot; <?= e($fs['admission_number'] ?? '') ?></p>
                        <?php if ((float)($fs['credit_balance'] ?? 0) > 0): ?>
                            <p class="text-xs text-emerald-600 font-medium">Credit: <?= money((float)$fs['credit_balance']) ?></p>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>

    <?php if (!empty($familyInvoices)): ?>
    <!-- Outstanding Invoices + Payment Form -->
    <form method="POST" id="familyPayForm">
        <?= csrfField() ?>
        <input type="hidden" name="family_id" value="<?= e($familyId) ?>">

        <div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
            <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 class="text-sm font-semibold text-gray-700">Outstanding Invoices</h3>
                <label class="flex items-center gap-1 text-xs text-emerald-600 cursor-pointer">
                    <input type="checkbox" id="payAll" onchange="togglePayAll(this)" class="w-3 h-3 rounded border-gray-300 text-emerald-600"> Pay all balances
                </label>
            </div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b border-gray-100">
                        <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Invoice</th>
                        <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Student</th>
                        <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Class</th>
                        <th class="text-right px-4 py-2 font-semibold text-gray-500 text-xs">Total</th>
                        <th class="text-right px-4 py-2 font-semibold text-gray-500 text-xs">Paid</th>
                        <th class="text-right px-4 py-2 font-semibold text-gray-500 text-xs">Balance</th>
                        <th class="text-right px-4 py-2 font-semibold text-gray-500 text-xs w-36">Pay Amount</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    <?php foreach ($familyInvoices as $inv):
                        $stu = $studentLookup[$inv['student_id']] ?? null;
                        $invTotal = (float)($inv['amount'] ?? 0);
                        $invPaid  = (float)($inv['paid_amount'] ?? 0);
                        $invBal   = $invTotal - $invPaid;
                    ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($inv['reference'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-gray-700"><?= $stu ? e($stu['first_name'] . ' ' . $stu['last_name']) : '—' ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= e($classMap[$stu['current_class_id'] ?? ''] ?? '—') ?></td>
                        <td class="px-4 py-3 text-right"><?= money($invTotal) ?></td>
                        <td class="px-4 py-3 text-right text-emerald-600"><?= money($invPaid) ?></td>
                        <td class="px-4 py-3 text-right text-red-600 font-medium"><?= money($invBal) ?></td>
                        <td class="px-4 py-3 text-right">
                            <input type="number" name="allocations[<?= e($inv['id']) ?>]" value="0" min="0" step="0.01"
                                   data-balance="<?= $invBal ?>"
                                   onchange="recalcTotal()" oninput="recalcTotal()"
                                   class="alloc-input w-full px-2 py-1.5 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm text-right">
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- Payment details -->
        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 class="text-sm font-semibold text-gray-700 mb-4">Payment Details</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Method</label>
                    <select name="method" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <?= paymentMethodOptions() ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input type="date" name="payment_date" value="<?= date('Y-m-d') ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Payment Reference <span class="text-red-500">*</span></label>
                    <input type="text" name="transaction_ref" required placeholder="M-Pesa code, bank slip number, or paper receipt number" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <p class="text-xs text-gray-400 mt-1">The payer's proof of payment. The school's receipt number is generated automatically.</p>
                </div>
            </div>

            <div class="flex items-center justify-between border-t border-gray-100 pt-4">
                <div>
                    <p class="text-sm text-gray-500">Total Payment</p>
                    <p class="text-2xl font-bold text-emerald-700" id="payTotalDisplay">0.00</p>
                    <input type="hidden" name="total_amount" id="payTotalInput" value="0">
                </div>
                <button type="submit" id="payBtn" disabled class="px-6 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                    Record Family Payment
                </button>
            </div>
        </div>
    </form>

    <script>
    function togglePayAll(el) {
        document.querySelectorAll('.alloc-input').forEach(inp => {
            inp.value = el.checked ? parseFloat(inp.dataset.balance).toFixed(2) : '0';
        });
        recalcTotal();
    }

    function recalcTotal() {
        let total = 0;
        document.querySelectorAll('.alloc-input').forEach(inp => {
            total += parseFloat(inp.value) || 0;
        });
        document.getElementById('payTotalDisplay').textContent = total.toFixed(2);
        document.getElementById('payTotalInput').value = total.toFixed(2);
        document.getElementById('payBtn').disabled = total <= 0;
    }
    </script>

    <?php else: ?>
        <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p class="text-emerald-600 text-lg font-semibold">All invoices paid!</p>
            <p class="text-sm text-gray-500 mt-1">This family has no outstanding invoices.</p>
        </div>
    <?php endif; ?>

<?php elseif ($searchQuery): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p class="text-gray-500">No students found for "<?= e($searchQuery) ?>".</p>
        <p class="text-sm text-gray-400 mt-1">Try searching by Family ID (e.g. FAM-001) or student first name.</p>
    </div>
<?php else: ?>
    <!-- Empty state doubles as a "what is this page" explainer.
         The search box above is the primary action; this block teaches first-time users
         the why/when so they don't have to ask. -->
    <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            </div>
            <div class="flex-1">
                <h2 class="text-base font-semibold text-gray-900">Pay for all siblings in one go</h2>
                <p class="text-sm text-gray-600 mt-1">Use Family Billing when a parent has more than one child at the school. Instead of paying each invoice separately, you take one payment and split it across the siblings' open invoices in a single step.</p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                    <div class="rounded-lg bg-emerald-50/50 border border-emerald-100 p-4">
                        <p class="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">When to use it</p>
                        <ul class="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                            <li>A parent pays a lump sum (e.g. M&#8209;Pesa for KES 100,000) covering 2&#8211;3 kids.</li>
                            <li>You need to see a family's <em>total</em> balance, not per-student.</li>
                            <li>You want overpayment from one sibling to top up another's credit.</li>
                        </ul>
                    </div>
                    <div class="rounded-lg bg-gray-50 border border-gray-100 p-4">
                        <p class="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">How it works</p>
                        <ol class="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                            <li>Search by <strong>Family ID</strong> (e.g. FAM&#8209;001) or any sibling's name.</li>
                            <li>Enter the total amount the parent paid and the method.</li>
                            <li>Allocate across each child's open invoices &mdash; the form will suggest a split.</li>
                            <li>Save once. Each allocation is recorded as its own payment, fully traceable.</li>
                        </ol>
                    </div>
                </div>

                <div class="mt-5 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
                    <strong>Prerequisite:</strong> siblings must share a <em>Family ID</em> in the student profile. Open
                    <a href="<?= baseUrl('students') ?>" class="underline font-medium hover:text-amber-900">All Students</a>,
                    edit each sibling, and set the same Family ID (e.g. FAM&#8209;001). After that they'll show up together here.
                </div>
            </div>
        </div>
    </div>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
