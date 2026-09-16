<?php
/**
 * Ask Tuta — a manager's questions answered from the school's own data.
 *
 * "How much did we collect this week?" "Who owes more than 20,000 in Grade 5?"
 * "What's in the petty cash tin?" The model never does arithmetic and never
 * guesses: every number it speaks comes back from one of the read-only tools
 * below, each of which is scoped to the caller's school. It cannot write —
 * no payment, no fee change, no message — and it is told so.
 *
 * Same brain for every door. The in-app Ask page calls assistantAsk(); the
 * WhatsApp webhook will call the same function once the number is live.
 *
 * Raw cURL against the Messages API, matching includes/anthropic.php — the
 * server has no Composer, and the existing briefing already takes this route.
 */

require_once __DIR__ . '/anthropic.php';

const ASSISTANT_MODEL = 'claude-opus-5';
// Anthropic list price per million tokens, for the running cost shown to the user.
const ASSISTANT_PRICE_IN  = 5.00;
const ASSISTANT_PRICE_OUT = 25.00;
const ASSISTANT_PRICE_CACHE_READ = 0.50;

/**
 * What the query tool can see. Kept as prose the model reads once; it sits in
 * the cached system prompt so it costs almost nothing per question.
 */
const ASSISTANT_SCHEMA = <<<'TXT'
You can run your own read-only SQL (PostgreSQL) against these views. They are already limited to the school (or the group's schools) — never filter by school id yourself. Every view also carries school_id and school_name; when more than one school is in scope, GROUP BY school_name to compare branches. Only these views exist — there are no other tables.

v_students(id, admission_number, first_name, last_name, middle_name, gender, dob, status['active'|'exited'], student_type['day_scholar'|'boarder'], admission_date, exit_date, exit_reason, exit_to_school, class_id, class_name, section_id, section_name, guardian_name, guardian_phone, guardian_name_2, guardian_phone_2, family_id, credit_balance)
v_guardians(id, student_id, name, relation, phone, email, id_number, occupation, address, is_primary, is_billing_contact)  -- extra guardians; the flat guardian_* columns on v_students are the main contacts
v_classes(id, name, level, capacity)
v_sections(id, class_id, class_name, name, capacity)  -- a section is a stream within a class (e.g. Grade 4 · Tiger)
v_terms(id, name, start_date, end_date, due_date, is_current, academic_year_id, academic_year)
v_invoices(id, reference, student_id, term_id, term_name, academic_year_id, amount, paid_amount, balance, status['unpaid'|'partial'|'paid'|'cancelled'|'draft'], issued_date, due_date, discount_amount, discount_reason, balance_brought_forward, penalty_amount, credit_applied, created_at)  -- exclude status 'cancelled' and 'draft' when totalling
v_invoice_items(id, invoice_id, description, amount, fee_head_id, fee_head)  -- transport lines have fee_head NULL and description like 'Transport — %'
v_payments(id, receipt_number, student_id, invoice_id, amount, method['cash'|'mpesa'|'paybill'|'bank_transfer'|'cheque'|…], status['completed'|'voided'], paid_at, payment_date, transaction_ref, mpesa_code, bank_name, note, voided_at, void_reason, recorded_by)  -- exclude status 'voided'
v_fee_heads(id, name, code, category, amount, is_mandatory, class_id, billing_period, is_active, cost_centre_id, cost_centre)
v_expenses(id, expense_date, description, amount, vendor_name, invoice_number, payment_method['cash'|'petty_cash'|'mpesa'|'bank_transfer'|…], category_id, category, parent_category, approval_status, created_at, cost_centre_id, cost_centre, cost_centre_type, litres, odometer_km, payment_status['paid'|'unpaid'], paid_date)  -- payment_status 'unpaid' = a supplier invoice still owed; "what do we owe suppliers" = sum where payment_status='unpaid'  -- category is the specific line (e.g. Fuel), parent_category the heading (e.g. Transport); group by parent_category for a P&L-style view
v_expense_categories(id, name, code, parent_category_id, parent_name, account_code, is_active)
v_cost_centres(id, name, type['bus'|'kitchen'|'boarding'|'activity'|'premises'|'equipment'|'project'|'class'|'department'|'other'], vehicle_id, class_id, budget_amount, budget_period, start_date, end_date, is_active)  -- a cost centre is the THING money was spent on (Bus 3, Kitchen); expenses.cost_centre_id links; a bus's riders are v_transport rows whose vehicle_id matches; a kitchen's income is v_invoice_items whose fee head has that cost_centre_id
v_petty_cash(id, kind['in'|'count'], entry_date, amount, source, counted_amount, book_amount, variance, note, created_by_email)  -- spends are in v_expenses with payment_method='petty_cash'
v_transport(id, student_id, route_id, route_name, route_fee, vehicle_id, bus, driver_name, driver_phone, zone_id, pickup_point, transport_type['both'|'morning'|'evening'], fee_amount, fee_reason, start_date, end_date, is_active)  -- one active row per rider
v_transport_routes(id, name, fee_amount, vehicle_id, bus, is_active)
v_attendance(id, student_id, date, status['present'|'absent'|'late'|…], note, marked_by_name)
v_enquiries(id, name, phone, email, child_name, child_dob, grade_interest, status['new'|'contacted'|'visit_booked'|'applied'|'admitted'|'lost'|'spam'|'archived'], source, assigned_email, follow_up_at, contacted_at, lost_reason, admission_id, student_id, created_at, last_activity_at)
v_admissions(id, status['pending'|'approved'|'rejected'], first_name, last_name, gender, dob, grade_applying, previous_school, guardian_name, guardian_phone, created_at, reviewed_at, created_student_id, enquiry_id)
v_staff(user_id, full_name, phone, role)

Joins: v_invoices.student_id = v_students.id; v_payments.student_id = v_students.id; v_transport.student_id = v_students.id; v_attendance.student_id = v_students.id; v_students.family_id groups siblings (may be null — siblings can also be found by matching guardian_phone).
Money is KES. Dates are DATE or TIMESTAMPTZ; use CURRENT_DATE and date arithmetic freely. Results are capped at 200 rows, so aggregate in SQL rather than pulling everything.
TXT;

/** The tools, each a definition plus the closure that answers it. */
function assistantTools(string $sid, ?string $groupId): array
{
    $sb = new Supabase();
    $tools = [];

    // ── Group door: no school in context, every branch in scope ──────
    if ($sid === '' && $groupId) {
        $tools['group_overview'] = [
            'def' => [
                'name' => 'group_overview',
                'description' => 'Every branch side by side for its own current term: learners, invoiced, collected, outstanding, collection rate, arrears, last 7 days, this month\'s spend, attendance today. Start here for "how are we doing", "which branch is behind".',
                'input_schema' => ['type' => 'object', 'properties' => new stdClass()],
            ],
            'run' => function () use ($sb, $groupId) {
                $r = $sb->rpc('group_dashboard_stats', ['p_group_id' => $groupId])['data'] ?? [];
                return is_array($r) ? ['branches' => $r, 'currency' => 'KES'] : ['error' => 'Group figures are not available.'];
            },
        ];
        $tools['group_trends'] = [
            'def' => [
                'name' => 'group_trends',
                'description' => 'Per branch: collections by week for the last 8 weeks, spend by month for 6 months, learners joined and left this term, enquiries (new in 30 days, still open), transport riders. Group-wide: this month\'s spend by heading and the ten largest fee balances anywhere.',
                'input_schema' => ['type' => 'object', 'properties' => new stdClass()],
            ],
            'run' => function () use ($sb, $groupId) {
                $r = $sb->rpc('group_dashboard_more', ['p_group_id' => $groupId])['data'] ?? [];
                return is_array($r) ? $r + ['currency' => 'KES'] : ['error' => 'Group trends are not available (migration 141).'];
            },
        ];
        $tools['query'] = [
            'def' => [
                'name' => 'query',
                'description' => 'Run your own read-only SQL across ALL the group\'s schools (schema in your instructions; every view has school_name). Use it for any comparison or question the two summaries do not answer exactly: cost per learner per branch, which buses lose money, siblings across branches, a debtor by name. GROUP BY school_name to compare. If it errors, fix the SQL and try again.',
                'input_schema' => ['type' => 'object', 'properties' => [
                    'sql'     => ['type' => 'string', 'description' => 'One SELECT statement against the v_* views.'],
                    'purpose' => ['type' => 'string', 'description' => 'One line on what this query answers, in plain words.'],
                ], 'required' => ['sql', 'purpose']],
            ],
            'run' => function (array $in) use ($sb, $groupId) {
                $r = $sb->rpc('assistant_group_query', ['p_group_id' => $groupId, 'p_sql' => (string)($in['sql'] ?? '')]);
                $d = $r['data'] ?? null;
                if (!is_array($d)) return ['ok' => false, 'error' => $r['error'] ?? 'The query could not be run.'];
                return $d;
            },
        ];
        return $tools;
    }

    // ── School door ─────────────────────────────────────────────────
    $classMap = cachedClassMap();
    $term     = cachedCurrentTerm();

    $tools['fees_summary'] = [
        'def' => [
            'name' => 'fees_summary',
            'description' => 'Fee position for the school: invoiced, collected, outstanding and collection rate, with a per-class breakdown. Use for any question about how fees are going overall.',
            'input_schema' => ['type' => 'object', 'properties' => [
                'scope' => ['type' => 'string', 'enum' => ['current_term', 'all_time'], 'description' => 'current_term (default) or all_time'],
            ]],
        ],
        'run' => function (array $in) use ($sb, $sid, $classMap, $term) {
            $q = $sb->from('invoices')->select('student_id,amount,paid_amount,status,term_id')->eq('school_id', $sid)->neq('status', 'cancelled');
            if (($in['scope'] ?? 'current_term') === 'current_term' && !empty($term['id'])) $q = $q->eq('term_id', $term['id']);
            $inv = Supabase::fetchAllPaged(fn($_sb) => $q) ?: [];
            $stu = Supabase::fetchAllPaged(fn($_sb) => $_sb->from('students')->select('id,current_class_id')->eq('school_id', $sid)->eq('status', 'active')) ?: [];
            $cls = []; foreach ($stu as $s) $cls[$s['id']] = $s['current_class_id'] ?? '';
            $billed = $paid = 0; $byClass = []; $debtors = [];
            foreach ($inv as $i) {
                if (($i['status'] ?? '') === 'draft') continue;
                $a = (float)$i['amount']; $p = (float)$i['paid_amount'];
                $billed += $a; $paid += $p;
                $c = $classMap[$cls[$i['student_id']] ?? ''] ?? 'Unassigned';
                $byClass[$c]['billed'] = ($byClass[$c]['billed'] ?? 0) + $a;
                $byClass[$c]['paid']   = ($byClass[$c]['paid'] ?? 0) + $p;
                if ($a - $p > 0.005) $debtors[$i['student_id']] = true;
            }
            ksort($byClass);
            return [
                'scope' => $in['scope'] ?? 'current_term', 'term' => $term['name'] ?? null,
                'invoiced' => round($billed), 'collected' => round($paid), 'outstanding' => round($billed - $paid),
                'collection_rate_pct' => $billed > 0 ? round($paid / $billed * 100, 1) : null,
                'learners_with_balance' => count($debtors), 'active_learners' => count($stu),
                'by_class' => array_map(fn($k, $v) => ['class' => $k, 'invoiced' => round($v['billed']), 'collected' => round($v['paid']), 'outstanding' => round($v['billed'] - $v['paid'])], array_keys($byClass), $byClass),
                'currency' => 'KES',
            ];
        },
    ];

    $tools['arrears'] = [
        'def' => [
            'name' => 'arrears',
            'description' => 'Learners who owe money, largest balance first, with class and guardian phone. Use for "who owes", "biggest debtors", "balances in Grade X".',
            'input_schema' => ['type' => 'object', 'properties' => [
                'class_name' => ['type' => 'string', 'description' => 'Limit to one class, e.g. "Grade 5". Omit for all.'],
                'min_amount' => ['type' => 'number', 'description' => 'Only balances at or above this amount in KES.'],
                'limit'      => ['type' => 'integer', 'description' => 'How many to return (default 15, max 50).'],
            ]],
        ],
        'run' => function (array $in) use ($sb, $sid, $classMap) {
            $inv = Supabase::fetchAllPaged(fn($_sb) => $_sb->from('invoices')->select('student_id,amount,paid_amount,status')->eq('school_id', $sid)->neq('status', 'cancelled')) ?: [];
            $bal = [];
            foreach ($inv as $i) { if (($i['status'] ?? '') === 'draft') continue; $b = (float)$i['amount'] - (float)$i['paid_amount']; if ($b > 0) $bal[$i['student_id']] = ($bal[$i['student_id']] ?? 0) + $b; }
            $min = (float)($in['min_amount'] ?? 0);
            $bal = array_filter($bal, fn($b) => $b >= $min);
            arsort($bal);
            $ids = array_keys($bal);
            $stu = $ids ? Supabase::fetchByChunkedIn(fn($_sb) => $_sb->from('students')->select('id,first_name,last_name,admission_number,current_class_id,guardian_name,guardian_phone')->eq('status', 'active'), 'id', $ids) : [];
            $map = []; foreach ($stu as $s) $map[$s['id']] = $s;
            $want = isset($in['class_name']) ? strtolower(trim($in['class_name'])) : null;
            $rows = []; $total = 0; $count = 0;
            foreach ($bal as $id => $b) {
                $s = $map[$id] ?? null; if (!$s) continue;
                $cname = $classMap[$s['current_class_id'] ?? ''] ?? '';
                if ($want !== null && strtolower($cname) !== $want) continue;
                $total += $b; $count++;
                if (count($rows) < min(50, (int)($in['limit'] ?? 15))) {
                    $rows[] = ['learner' => trim($s['first_name'] . ' ' . $s['last_name']), 'admission_no' => $s['admission_number'], 'class' => $cname,
                               'balance' => round($b), 'guardian' => $s['guardian_name'], 'guardian_phone' => $s['guardian_phone']];
                }
            }
            return ['matching_learners' => $count, 'total_owed' => round($total), 'shown' => count($rows), 'rows' => $rows, 'currency' => 'KES'];
        },
    ];

    $tools['collections'] = [
        'def' => [
            'name' => 'collections',
            'description' => 'Payments received between two dates: total, by payment method, and by day. Use for "this week", "today", "last month", "how much came in".',
            'input_schema' => ['type' => 'object', 'properties' => [
                'from' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD'],
                'to'   => ['type' => 'string', 'description' => 'End date YYYY-MM-DD (inclusive)'],
            ], 'required' => ['from', 'to']],
        ],
        'run' => function (array $in) use ($sb, $sid) {
            $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['from'] ?? '') ? $in['from'] : date('Y-m-01');
            $to   = preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['to'] ?? '') ? $in['to'] : date('Y-m-d');
            $pay = Supabase::fetchAllPaged(fn($_sb) => $_sb->from('payments')->select('amount,method,paid_at,status')->eq('school_id', $sid)
                ->gte('paid_at', $from . 'T00:00:00')->lte('paid_at', $to . 'T23:59:59')) ?: [];
            $total = 0; $byM = []; $byDay = []; $n = 0;
            foreach ($pay as $p) {
                if (in_array($p['status'] ?? 'completed', ['voided', 'cancelled'], true)) continue;
                $a = (float)$p['amount']; $total += $a; $n++;
                $m = $p['method'] ?: 'other'; $byM[$m] = ($byM[$m] ?? 0) + $a;
                $d = substr($p['paid_at'], 0, 10); $byDay[$d] = ($byDay[$d] ?? 0) + $a;
            }
            arsort($byM); ksort($byDay);
            return ['from' => $from, 'to' => $to, 'total' => round($total), 'payments' => $n,
                    'by_method' => array_map('round', $byM), 'by_day' => array_map('round', $byDay), 'currency' => 'KES'];
        },
    ];

    $tools['enrolment'] = [
        'def' => [
            'name' => 'enrolment',
            'description' => 'Active learners by class, gender and boarding status, plus how many left this term. Use for "how many students", "class sizes", "boys and girls".',
            'input_schema' => ['type' => 'object', 'properties' => new stdClass()],
        ],
        'run' => function () use ($sb, $sid, $classMap, $term) {
            $stu = Supabase::fetchAllPaged(fn($_sb) => $_sb->from('students')->select('id,current_class_id,gender,student_type,status,exit_date,exit_reason')->eq('school_id', $sid)) ?: [];
            $byClass = []; $g = ['male' => 0, 'female' => 0, 'unknown' => 0]; $type = ['boarder' => 0, 'day' => 0]; $active = 0; $left = [];
            foreach ($stu as $s) {
                if (($s['status'] ?? 'active') !== 'active') {
                    if (!empty($s['exit_date']) && !empty($term['start_date']) && $s['exit_date'] >= $term['start_date']) $left[$s['exit_reason'] ?: 'unspecified'] = ($left[$s['exit_reason'] ?: 'unspecified'] ?? 0) + 1;
                    continue;
                }
                $active++;
                $c = $classMap[$s['current_class_id'] ?? ''] ?? 'Unassigned'; $byClass[$c] = ($byClass[$c] ?? 0) + 1;
                $gg = strtolower((string)$s['gender']); $g[$gg === 'male' || $gg === 'female' ? $gg : 'unknown']++;
                $type[($s['student_type'] ?? '') === 'boarder' ? 'boarder' : 'day']++;
            }
            ksort($byClass);
            return ['active' => $active, 'by_class' => $byClass, 'gender' => $g, 'boarding' => $type, 'left_this_term' => $left, 'term' => $term['name'] ?? null];
        },
    ];

    $tools['expenses'] = [
        'def' => [
            'name' => 'expenses',
            'description' => 'Money spent between two dates, total and by category, and how it was paid. Use for "what did we spend", "expenses this month".',
            'input_schema' => ['type' => 'object', 'properties' => [
                'from' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD'],
                'to'   => ['type' => 'string', 'description' => 'End date YYYY-MM-DD'],
            ], 'required' => ['from', 'to']],
        ],
        'run' => function (array $in) use ($sb, $sid) {
            $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['from'] ?? '') ? $in['from'] : date('Y-m-01');
            $to   = preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['to'] ?? '') ? $in['to'] : date('Y-m-d');
            $cats = $sb->from('expense_categories')->select('id,name')->eq('school_id', $sid)->execute()['data'] ?? [];
            $cn = []; foreach ($cats as $c) $cn[$c['id']] = $c['name'];
            $ex = Supabase::fetchAllPaged(fn($_sb) => $_sb->from('expenses')->select('amount,category_id,payment_method,expense_date,vendor_name')->eq('school_id', $sid)->gte('expense_date', $from)->lte('expense_date', $to)) ?: [];
            $total = 0; $byC = []; $byM = []; $n = 0;
            foreach ($ex as $e) { $a = (float)$e['amount']; $total += $a; $n++; $c = $cn[$e['category_id'] ?? ''] ?? 'Uncategorised'; $byC[$c] = ($byC[$c] ?? 0) + $a; $m = $e['payment_method'] ?: 'unknown'; $byM[$m] = ($byM[$m] ?? 0) + $a; }
            arsort($byC);
            return ['from' => $from, 'to' => $to, 'total' => round($total), 'entries' => $n, 'by_category' => array_map('round', $byC), 'by_method' => array_map('round', $byM), 'currency' => 'KES',
                    'note' => $n === 0 ? 'No expenses have been recorded in this period. That usually means they are not being logged, not that nothing was spent.' : null];
        },
    ];

    $tools['petty_cash'] = [
        'def' => [
            'name' => 'petty_cash',
            'description' => 'The petty cash book: what should be in the tin now, received and spent this month, spending by category, and the last count.',
            'input_schema' => ['type' => 'object', 'properties' => new stdClass()],
        ],
        'run' => function () use ($sb, $sid) {
            $s = $sb->rpc('petty_cash_summary', ['p_school_id' => $sid])['data'] ?? [];
            if (!is_array($s)) return ['error' => 'Petty cash is not set up at this school yet.'];
            unset($s['entries']);
            return $s + ['currency' => 'KES'];
        },
    ];

    $tools['transport'] = [
        'def' => [
            'name' => 'transport',
            'description' => 'Who rides school transport: riders per route and per bus, how many have a reachable guardian number, routes with no bus.',
            'input_schema' => ['type' => 'object', 'properties' => new stdClass()],
        ],
        'run' => function () use ($sb, $sid) {
            $r = $sb->rpc('transport_roster', ['p_school_id' => $sid])['data'] ?? [];
            if (!is_array($r)) return ['error' => 'Transport data is not available.'];
            $byRoute = []; foreach ((array)($r['students'] ?? []) as $s) $byRoute[$s['route_name']] = ($byRoute[$s['route_name'] ?? ''] ?? 0) + 1;
            arsort($byRoute);
            return ['riders' => $r['total'] ?? 0, 'reachable' => $r['reachable'] ?? 0,
                    'buses' => array_map(fn($b) => ['bus' => $b['label'], 'routes' => $b['routes'], 'riders' => $b['riders'], 'driver' => $b['driver_name']], (array)($r['vehicles'] ?? [])),
                    'routes_without_bus' => array_column((array)($r['unassigned_routes'] ?? []), 'name'),
                    'riders_by_route' => $byRoute];
        },
    ];

    $tools['cost_centres'] = [
        'def' => [
            'name' => 'cost_centres',
            'description' => 'What each bus, the kitchen, boarding, buildings and projects cost and earn between two dates: spend, income (a bus earns its riders\' termly fees; a kitchen earns the meal fee invoiced), learners served, budget. Use for "what does Bus 3 cost", "does the kitchen pay for itself", "cost per child".',
            'input_schema' => ['type' => 'object', 'properties' => [
                'from' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD (default: start of the current term)'],
                'to'   => ['type' => 'string', 'description' => 'End date YYYY-MM-DD (default: today)'],
            ]],
        ],
        'run' => function (array $in) use ($sb, $sid, $term) {
            $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['from'] ?? '') ? $in['from'] : ($term['start_date'] ?? date('Y-01-01'));
            $to   = preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['to'] ?? '') ? $in['to'] : date('Y-m-d');
            $r = $sb->rpc('cost_centre_overview', ['p_school_id' => $sid, 'p_from' => $from, 'p_to' => $to])['data'] ?? null;
            if (!is_array($r)) return ['error' => 'Cost centres are not set up yet (migration 140).'];
            $rows = array_map(fn($c) => [
                'name' => $c['name'], 'type' => $c['type'], 'spend' => round((float)$c['spend']), 'entries' => (int)$c['entries'],
                'income' => round((float)$c['income']), 'income_basis' => $c['income_basis'], 'learners' => (int)$c['learners'],
                'cost_per_learner' => (int)$c['learners'] > 0 ? round((float)$c['spend'] / (int)$c['learners']) : null,
                'budget' => $c['budget_amount'] !== null ? round((float)$c['budget_amount']) : null, 'budget_period' => $c['budget_period'],
            ], $r);
            return ['from' => $from, 'to' => $to, 'centres' => $rows, 'currency' => 'KES',
                    'note' => 'Spend only counts expenses tagged to a centre. Salaries are not yet allocated to centres.'];
        },
    ];

    $tools['query'] = [
        'def' => [
            'name' => 'query',
            'description' => 'Run your own read-only SQL against the school\'s views (schema in your instructions). Use this for anything the other tools do not cover exactly: siblings, cross-checks between fees and transport or attendance, per-stream breakdowns, trends over time, who paid last term but not this one, fuel per bus, and any question with more than one condition. Aggregate in SQL. If it errors, read the message, fix the SQL and try again.',
            'input_schema' => ['type' => 'object', 'properties' => [
                'sql'     => ['type' => 'string', 'description' => 'One SELECT statement against the v_* views. No school filter needed.'],
                'purpose' => ['type' => 'string', 'description' => 'One line on what this query answers, in plain words.'],
            ], 'required' => ['sql', 'purpose']],
        ],
        'run' => function (array $in) use ($sb, $sid) {
            $r = $sb->rpc('assistant_query', ['p_school_id' => $sid, 'p_sql' => (string)($in['sql'] ?? '')]);
            $d = $r['data'] ?? null;
            if (!is_array($d)) return ['ok' => false, 'error' => $r['error'] ?? 'The query could not be run.'];
            return $d;
        },
    ];

    // A group admin inside one branch can still glance across the group.
    if ($groupId) {
        $tools['group_overview'] = [
            'def' => [
                'name' => 'group_overview',
                'description' => 'Every branch in the school group side by side: learners, invoiced, collected, outstanding, collection rate, attendance. Use for "compare the branches", "which school is behind", "across the group".',
                'input_schema' => ['type' => 'object', 'properties' => new stdClass()],
            ],
            'run' => function () use ($sb, $groupId) {
                $r = $sb->rpc('group_dashboard_stats', ['p_group_id' => $groupId])['data'] ?? [];
                return is_array($r) ? ['branches' => $r, 'currency' => 'KES'] : ['error' => 'Group figures are not available.'];
            },
        ];
    }

    return $tools;
}

/**
 * Answer a conversation. $history is prior turns [['role','content'], …] as
 * plain text; the new question is last. Returns text, the tools it consulted,
 * token usage and an estimated cost.
 */
function assistantAsk(string $sid, array $history, ?string $groupId = null): array
{
    if (!claudeConfigured()) {
        return ['ok' => false, 'error' => 'AI is not configured. Add ANTHROPIC_API_KEY to config.php.'];
    }

    $groupMode = ($sid === '' && $groupId);
    if ($groupMode) {
        $context = "Context: the user is the director/administrator of the school group \"" . ($_SESSION['group_name'] ?? 'the group') . "\" and is asking about ALL its branches at once. "
                 . "Each branch has its own current term. Name branches by school_name. When they ask about one branch by name, filter on school_name ILIKE in SQL. ";
    } else {
        $school  = schoolSetting('school_name', 'this school');
        $term    = cachedCurrentTerm();
        $context = "Context: school = {$school}; current term = " . ($term['name'] ?? 'not set') . (isset($term['start_date']) ? " (from {$term['start_date']})" : '') . "; "
                 . ($groupId ? "the user also manages a group of schools, so group_overview is available. " : "the user manages this one school. ");
    }
    $tools  = assistantTools($sid, $groupId);
    $defs   = array_values(array_map(fn($t) => $t['def'], $tools));

    $system = [[
        'type' => 'text',
        'text' => "You are Ask Tuta, the assistant inside Tuta School, a school management system used in Kenya. "
            . "You answer questions from the school's managers using ONLY the tools provided. "
            . "Rules:\n"
            . "- Every figure you state must come from a tool result in this conversation. Never estimate, extrapolate or recall a number. If a tool cannot answer, say what is missing.\n"
            . "- You are read-only. You cannot record, change, send or delete anything. If asked to, say so plainly and tell them where in Tuta to do it.\n"
            . "- Amounts are Kenyan shillings; write them as KES 12,500 with no decimals unless they matter.\n"
            . "- Be brief and direct, as if replying on WhatsApp: short paragraphs or a short list, no headings, no markdown tables, no bold. Lead with the answer, then the one or two figures that support it.\n"
            . "- When a result looks wrong or empty (for example zero expenses), say that the record may be incomplete rather than concluding nothing happened.\n"
            . "- Dates: today is " . date('l j F Y') . ". \"This week\" means Monday to today; \"this month\" means the 1st to today; \"this term\" means the current term.\n"
            . "For anything the named tools do not answer exactly, write SQL with the query tool — prefer it over guessing or over saying you cannot. Show the user the answer, not the SQL, unless they ask.\n\n"
            . ASSISTANT_SCHEMA . "\n\n"
            . $context,
        'cache_control' => ['type' => 'ephemeral'],
    ]];

    $messages = [];
    foreach ($history as $h) {
        if (!in_array($h['role'] ?? '', ['user', 'assistant'], true)) continue;
        $messages[] = ['role' => $h['role'], 'content' => (string)$h['content']];
    }
    if (!$messages || end($messages)['role'] !== 'user') return ['ok' => false, 'error' => 'Nothing to answer.'];

    $used = []; $usage = ['in' => 0, 'out' => 0, 'cache_read' => 0, 'cache_write' => 0]; $hops = 0;

    while (true) {
        $r = assistantCall($system, $messages, $defs);
        if (!$r['ok']) return $r;
        $data = $r['data'];
        $usage['in']  += (int)($data['usage']['input_tokens'] ?? 0);
        $usage['out'] += (int)($data['usage']['output_tokens'] ?? 0);
        $usage['cache_read']  += (int)($data['usage']['cache_read_input_tokens'] ?? 0);
        $usage['cache_write'] += (int)($data['usage']['cache_creation_input_tokens'] ?? 0);

        if (($data['stop_reason'] ?? '') === 'refusal') {
            return ['ok' => false, 'error' => 'The assistant declined to answer that.'];
        }
        if (($data['stop_reason'] ?? '') !== 'tool_use' || ++$hops > 6) {
            $text = '';
            foreach ($data['content'] ?? [] as $b) if (($b['type'] ?? '') === 'text') $text .= $b['text'];
            // input_tokens excludes the cached prefix; cache reads and writes are
            // reported separately (writes cost 1.25x the input rate).
            $cost = $usage['in'] / 1e6 * ASSISTANT_PRICE_IN
                  + $usage['cache_read'] / 1e6 * ASSISTANT_PRICE_CACHE_READ
                  + $usage['cache_write'] / 1e6 * ASSISTANT_PRICE_IN * 1.25
                  + $usage['out'] / 1e6 * ASSISTANT_PRICE_OUT;
            return ['ok' => true, 'text' => trim($text), 'tools' => array_values(array_unique($used)), 'usage' => $usage, 'cost_usd' => round($cost, 4)];
        }

        // Run every tool the model asked for, return all results in one turn.
        $results = [];
        foreach ($data['content'] as $b) {
            if (($b['type'] ?? '') !== 'tool_use') continue;
            $name = $b['name']; $used[] = $name;
            $out = isset($tools[$name]) ? ($tools[$name]['run'])(is_array($b['input']) ? $b['input'] : []) : ['error' => 'Unknown tool'];
            $results[] = ['type' => 'tool_result', 'tool_use_id' => $b['id'], 'content' => json_encode($out, JSON_UNESCAPED_UNICODE)];
        }
        // json_decode turns an empty {} into [], which re-encodes as a list and
        // the API rejects. Put the object back before echoing the turn.
        $echo = $data['content'];
        foreach ($echo as $k => $b) {
            if (($b['type'] ?? '') === 'tool_use' && empty($b['input'])) $echo[$k]['input'] = new stdClass();
        }
        $messages[] = ['role' => 'assistant', 'content' => $echo];
        $messages[] = ['role' => 'user', 'content' => $results];
    }
}

/** One Messages API call with tools. Raw cURL, same shape as claudeMessage(). */
function assistantCall(array $system, array $messages, array $tools): array
{
    $body = [
        'model'         => ASSISTANT_MODEL,
        'max_tokens'    => 2000,
        'system'        => $system,
        'tools'         => $tools,
        'messages'      => $messages,
        'output_config' => ['effort' => 'low'],
    ];
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => ['x-api-key: ' . ANTHROPIC_API_KEY, 'anthropic-version: 2023-06-01', 'content-type: application/json'],
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 90, CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch);
    if ($err) return ['ok' => false, 'error' => 'Connection error: ' . $err];
    $data = json_decode($resp, true);
    if ($code !== 200) return ['ok' => false, 'error' => $data['error']['message'] ?? ('HTTP ' . $code)];
    return ['ok' => true, 'data' => $data];
}
