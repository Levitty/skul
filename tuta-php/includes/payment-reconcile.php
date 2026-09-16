<?php
/**
 * Bank-agnostic payment reconciliation core.
 *
 * One place that turns "money arrived" into "invoice updated", reused by:
 *   • the manual reconciliation screen (admin attaches an unmatched payment),
 *   • future automated sources (Co-op IPN, an aggregator webhook, statement
 *     import) — each normalises its payload then calls reconcileTransaction().
 *
 * It deliberately does NOT modify the existing M-Pesa STK/C2B callbacks — those
 * keep their own working logic. This is the shared path everything NEW uses.
 *
 * Matching mirrors the C2B endpoint: invoice reference, then admission number,
 * then guardian phone. Applying records a payment, advances the invoice, and
 * banks any overpayment as student credit — all scoped to one school.
 */

/**
 * Fuzzy-find a student by whatever the payer typed as the account number.
 * Real admission numbers look like "UTS-281", "UTS_0020018", "Uts- 303";
 * parents at the till type "281", "uts281" or "UTS 281". Exact ilike alone
 * misses most honest attempts and floods the unmatched queue.
 *
 * Strategy (fail-closed on ambiguity — money must never guess):
 *   1) exact match, case-insensitive
 *   2) normalised match: strip every non-alphanumeric from both sides
 *   3) numeric-tail match: digits of the ref vs digits of each admission
 *      number (leading zeros ignored) — accepted only if exactly ONE
 *      student matches school-wide.
 * Returns ['id' => ..., 'via' => 'exact'|'normalized'|'digits'] or null.
 */
function reconcileFindStudentByRef(Supabase $sb, string $schoolId, string $ref): ?array
{
    $ref = trim($ref);
    if ($ref === '') return null;

    // 1) Exact (case-insensitive) — the cheap path.
    $s = $sb->from('students')->select('id')
        ->eq('school_id', $schoolId)->eq('status', 'active')
        ->ilike('admission_number', $ref)->limit(2)->execute();
    $rows = $s['data'] ?? [];
    if (count($rows) === 1) return ['id' => $rows[0]['id'], 'via' => 'exact'];

    // 2+3) Fetch the school's roster once and compare normalised forms.
    $all = Supabase::fetchAllPaged(function ($q) use ($schoolId) {
        return $q->from('students')->select('id,admission_number')
            ->eq('school_id', $schoolId)->eq('status', 'active');
    });
    $norm = static fn(string $v): string => strtolower(preg_replace('/[^a-z0-9]/i', '', $v));
    $refNorm   = $norm($ref);
    $refDigits = ltrim(preg_replace('/\D/', '', $ref), '0');

    $normHits = $digitHits = [];
    foreach ($all as $st) {
        $adm = (string)($st['admission_number'] ?? '');
        if ($adm === '') continue;
        if ($refNorm !== '' && $norm($adm) === $refNorm) $normHits[] = $st['id'];
        if ($refDigits !== '' && strlen($refDigits) >= 2
            && ltrim(preg_replace('/\D/', '', $adm), '0') === $refDigits) $digitHits[] = $st['id'];
    }
    if (count($normHits) === 1) return ['id' => $normHits[0], 'via' => 'normalized'];
    if (count($digitHits) === 1) return ['id' => $digitHits[0], 'via' => 'digits'];
    return null;   // no match, or ambiguous → manual reconciliation
}

/**
 * Find the invoice a payment should settle, within one school.
 *   $opts = ['account_ref' => string, 'phone' => string]
 * account_ref is whatever the payer typed (invoice ref OR admission number).
 * Returns the invoice row (id, student_id, amount, paid_amount, status,
 * reference) or null.
 */
function reconcileMatchInvoice(Supabase $sb, string $schoolId, array $opts): ?array
{
    $ref   = trim((string)($opts['account_ref'] ?? ''));
    $phone = trim((string)($opts['phone'] ?? ''));

    // 1) Exact-ish invoice reference.
    if ($ref !== '') {
        $r = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status,reference')
            ->eq('school_id', $schoolId)->ilike('reference', $ref)
            ->in('status', ['unpaid', 'partial'])->limit(1)->execute();
        $inv = ($r['data'] ?? [])[0] ?? null;
        if ($inv) return $inv;
    }

    // 2) Admission number (fuzzy) → that student's oldest open invoice.
    if ($ref !== '') {
        $stu = reconcileFindStudentByRef($sb, $schoolId, $ref);
        if ($stu) {
            $r = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status,reference')
                ->eq('school_id', $schoolId)->eq('student_id', $stu['id'])
                ->in('status', ['unpaid', 'partial'])->order('created_at')->limit(1)->execute();
            $inv = ($r['data'] ?? [])[0] ?? null;
            if ($inv) return $inv;
        }
    }

    // 3) Payer phone → the learner whose guardian it is → oldest open invoice.
    //    This is THE strategy for bank paybills (KCB, Co-op): the parent can't
    //    type an admission number there, so the phone on the statement is all
    //    we have. Match on the last 9 digits so 07…, 2547… and +2547… all hit,
    //    across both guardian slots and the full-form parents. Fail closed if
    //    the phone belongs to more than one learner — money must never guess.
    if ($phone !== '') {
        $stuId = reconcileStudentByPhone($sb, $schoolId, $phone);
        if ($stuId !== null) {
            $r = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status,reference')
                ->eq('school_id', $schoolId)->eq('student_id', $stuId)
                ->in('status', ['unpaid', 'partial'])->order('created_at')->limit(1)->execute();
            $inv = ($r['data'] ?? [])[0] ?? null;
            if ($inv) return $inv;
        }
    }

    return null;
}

/**
 * The one active learner a phone number belongs to (either guardian slot or
 * the guardians table), or null when none — or when it fits several, since
 * a parent with two children needs the admission number to say which.
 */
function reconcileStudentByPhone(Supabase $sb, string $schoolId, string $phone): ?string
{
    $digits = preg_replace('/[^0-9]/', '', $phone);
    $tail = substr($digits, -9);
    if (strlen($tail) < 9) return null;
    $ids = [];
    foreach (['guardian_phone', 'guardian_phone_2'] as $col) {
        $rows = $sb->from('students')->select('id')->eq('school_id', $schoolId)->eq('status', 'active')
            ->ilike($col, '%' . $tail . '%')->limit(5)->execute()['data'] ?? [];
        foreach ($rows as $r) $ids[$r['id']] = true;
    }
    $g = $sb->from('guardians')->select('student_id')->ilike('phone', '%' . $tail . '%')->limit(10)->execute()['data'] ?? [];
    $gids = array_values(array_unique(array_filter(array_column($g, 'student_id'))));
    if ($gids) {
        // Keep only this school's active learners.
        $rows = $sb->from('students')->select('id')->eq('school_id', $schoolId)->eq('status', 'active')->in('id', $gids)->execute()['data'] ?? [];
        foreach ($rows as $r) $ids[$r['id']] = true;
    }
    return count($ids) === 1 ? array_key_first($ids) : null;
}

/**
 * Apply a received payment to a known invoice. Idempotent on transaction_ref:
 * if a completed payment with the same ref already exists for the school, it's
 * a no-op (returns ['ok'=>true,'duplicate'=>true]).
 *
 *   $opts = ['amount'=>float, 'reference'=>string, 'method'=>string,
 *            'phone'=>?string, 'paid_at'=>?string('c'), 'actor'=>?string]
 */
function reconcileApplyPayment(Supabase $sb, string $schoolId, string $invoiceId, array $opts): array
{
    $amount = (float)($opts['amount'] ?? 0);
    $ref    = trim((string)($opts['reference'] ?? ''));
    $method = $opts['method'] ?? 'mpesa';
    $paidAt = $opts['paid_at'] ?? date('c');

    if ($amount <= 0) return ['ok' => false, 'error' => 'Amount must be greater than zero.'];

    // Idempotency: same transaction_ref already recorded?
    if ($ref !== '') {
        $dup = $sb->from('payments')->select('id')
            ->eq('school_id', $schoolId)->eq('transaction_ref', $ref)
            ->eq('status', 'completed')->limit(1)->execute();
        if (!empty($dup['data'])) return ['ok' => true, 'duplicate' => true, 'invoice_id' => $invoiceId];
    }

    $invRes  = $sb->from('invoices')->select('id,student_id,amount,paid_amount,status')
        ->eq('id', $invoiceId)->eq('school_id', $schoolId)->single()->execute();
    $invoice = $invRes['data'][0] ?? null;
    if (!$invoice) return ['ok' => false, 'error' => 'Invoice not found.'];
    if (in_array($invoice['status'], ['cancelled'], true)) return ['ok' => false, 'error' => 'Invoice is cancelled.'];

    $currentPaid  = (float)($invoice['paid_amount'] ?? 0);
    $invoiceTotal = (float)($invoice['amount'] ?? 0);
    $balanceOwed  = max(0.0, $invoiceTotal - $currentPaid);
    $toApply      = min($amount, $balanceOwed);
    $overpayment  = max(0.0, $amount - $balanceOwed);
    $newPaid      = $currentPaid + $toApply;
    $newStatus    = $newPaid >= $invoiceTotal ? 'paid' : 'partial';

    $sb->from('payments')->insert([
        'invoice_id'      => $invoiceId,
        'school_id'       => $schoolId,
        'amount'          => $amount,
        'method'          => $method,
        'transaction_ref' => $ref ?: null,
        'status'          => 'completed',
        'paid_at'         => $paidAt,
        'payment_date'    => date('Y-m-d'),
    ]);

    $sb->from('invoices')->eq('id', $invoiceId)->update([
        'paid_amount' => $newPaid,
        'status'      => $newStatus,
        'updated_at'  => date('c'),
    ]);

    if ($overpayment > 0 && !empty($invoice['student_id'])) {
        $stuRes = $sb->from('students')->select('id,credit_balance')->eq('id', $invoice['student_id'])->single()->execute();
        $credit = (float)($stuRes['data'][0]['credit_balance'] ?? 0);
        $sb->from('students')->eq('id', $invoice['student_id'])->update([
            'credit_balance' => $credit + $overpayment,
            'updated_at'     => date('c'),
        ]);
    }

    try {
        $sb->from('audit_logs')->insert([
            'school_id'   => $schoolId,
            'action'      => 'payment_reconciled',
            'entity_type' => 'invoice',
            'entity_id'   => $invoiceId,
            'payload'     => json_encode([
                'amount' => $amount, 'method' => $method, 'reference' => $ref,
                'applied' => $toApply, 'overpayment' => $overpayment > 0 ? $overpayment : null,
                'actor' => $opts['actor'] ?? null,
            ]),
        ]);
    } catch (\Throwable $e) {}

    return ['ok' => true, 'invoice_id' => $invoiceId, 'status' => $newStatus, 'applied' => $toApply, 'overpayment' => $overpayment];
}

/**
 * Full automated path: match then apply. For bank IPN / aggregator webhooks.
 *   $txn = ['amount'=>, 'reference'=>, 'account_ref'=>, 'phone'=>, 'method'=>, 'paid_at'=>]
 * Returns ['matched'=>bool, ...applyResult].
 */
function reconcileTransaction(Supabase $sb, string $schoolId, array $txn): array
{
    $invoice = reconcileMatchInvoice($sb, $schoolId, [
        'account_ref' => $txn['account_ref'] ?? '',
        'phone'       => $txn['phone'] ?? '',
    ]);
    if (!$invoice) return ['matched' => false];

    $res = reconcileApplyPayment($sb, $schoolId, $invoice['id'], [
        'amount'    => $txn['amount'] ?? 0,
        'reference' => $txn['reference'] ?? '',
        'method'    => $txn['method'] ?? 'mpesa',
        'phone'     => $txn['phone'] ?? null,
        'paid_at'   => $txn['paid_at'] ?? date('c'),
        'actor'     => $txn['actor'] ?? 'auto-reconcile',
    ]);
    return ['matched' => true] + $res;
}
