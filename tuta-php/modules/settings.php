<?php
/**
 * Settings — tabbed interface for all school configuration.
 * Tabs: School Profile | Academic | Subjects | Currency & Invoices | Payment Methods | M-Pesa
 */
$pageTitle = 'Settings';
$sb  = new Supabase();
$sid = schoolId();

$activeTab = input('tab') ?: 'profile';

// Handle actions
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // ── School Profile ──────────────────────────────────
    if ($action === 'update_school') {
        $schoolName    = input('school_name');
        $schoolAddress = input('school_address');
        $schoolPhone   = input('school_phone');
        $schoolEmail   = input('school_email');
        // Portal/login domain (e.g. crownofgold.tutagora.com or mgt.yourschool.com).
        // Strip any scheme/path so we store just the hostname.
        $schoolDomain  = strtolower(trim((string)input('school_domain')));
        $schoolDomain  = preg_replace('~^https?://~', '', $schoolDomain);
        $schoolDomain  = preg_replace('~/.*$~', '', $schoolDomain);

        if (!$schoolName) {
            flash('error', 'School name is required.');
            redirect('settings?tab=profile');
        }

        $updates = [
            'name'       => $schoolName,
            'address'    => $schoolAddress ?: null,
            'phone'      => $schoolPhone ?: null,
            'email'      => $schoolEmail ?: null,
            'domain'     => ($schoolDomain !== '' ? $schoolDomain : null),
            'updated_at' => date('c'),
        ];

        // Logo handling:
        //   - "Remove" checkbox      → clear logo_url.
        //   - A new file in $_FILES  → upload to Supabase Storage, store URL.
        //   - Otherwise              → omit logo_url; the current logo stays.
        if (!empty(input('remove_logo'))) {
            $updates['logo_url'] = null;
        } elseif (!empty($_FILES['school_logo_file']['name'] ?? '')) {
            $up = uploadSchoolLogo($sid, $_FILES['school_logo_file']);
            if (!$up['ok']) {
                flash('error', 'Could not upload logo: ' . $up['error']);
                redirect('settings?tab=profile');
            }
            $updates['logo_url'] = $up['url'];
        }

        $sb->from('schools')->eq('id', $sid)->update($updates);
        Supabase::clearCache('school_' . $sid);
        flash('success', 'School profile updated.');
        redirect('settings?tab=profile');
    }

    // ── Academic Years ───────────────────────────────────
    if ($action === 'add_year') {
        $name  = input('year_name');
        $start = input('year_start');
        $end   = input('year_end');
        if (!$name || !$start || !$end) {
            flash('error', 'Name, start date, and end date are all required.');
        } else {
            $sb->from('academic_years')->insert([
                'school_id'  => $sid,
                'name'       => $name,
                'start_date' => $start,
                'end_date'   => $end,
                'is_current' => false,
            ]);
            flash('success', 'Academic year added.');
        }
        Supabase::clearCache('years_' . $sid);
        Supabase::clearCache('year_' . $sid);
        redirect('settings?tab=academic');
    }

    if ($action === 'set_current_year') {
        $yearId = input('year_id');
        $sb->from('academic_years')->eq('school_id', $sid)->eq('is_current', 'true')->update(['is_current' => false]);
        $sb->from('academic_years')->eq('id', $yearId)->eq('school_id', $sid)->update(['is_current' => true]);
        Supabase::clearCache('years_' . $sid);
        Supabase::clearCache('year_' . $sid);
        flash('success', 'Current academic year updated.');
        redirect('settings?tab=academic');
    }

    if ($action === 'edit_year') {
        $yearId = input('year_id');
        $name   = input('year_name');
        $start  = input('year_start');
        $end    = input('year_end');
        if ($name && $start && $end) {
            $sb->from('academic_years')->eq('id', $yearId)->eq('school_id', $sid)->update([
                'name'       => $name,
                'start_date' => $start,
                'end_date'   => $end,
                'updated_at' => date('c'),
            ]);
            flash('success', 'Academic year updated.');
        } else {
            flash('error', 'Name, start date, and end date are required.');
        }
        Supabase::clearCache('years_' . $sid);
        Supabase::clearCache('year_' . $sid);
        redirect('settings?tab=academic');
    }

    // ── Terms ────────────────────────────────────────────
    if ($action === 'add_term') {
        $name   = input('term_name');
        $yearId = input('term_year_id');
        $start  = input('term_start');
        $end    = input('term_end');
        $due    = input('term_due') ?: $end;
        if (!$name || !$yearId || !$start || !$end) {
            flash('error', 'Name, academic year, start date, and end date are all required.');
        } else {
            $sb->from('terms')->insert([
                'school_id'        => $sid,
                'academic_year_id' => $yearId,
                'name'             => $name,
                'start_date'       => $start,
                'end_date'         => $end,
                'due_date'         => $due,
                'is_current'       => false,
            ]);
            flash('success', 'Term added.');
        }
        Supabase::clearCache('terms_' . $sid);
        Supabase::clearCache('term_' . $sid);
        redirect('settings?tab=academic');
    }

    if ($action === 'set_current_term') {
        $termId = input('term_id');
        $sb->from('terms')->eq('school_id', $sid)->eq('is_current', 'true')->update(['is_current' => false]);
        $sb->from('terms')->eq('id', $termId)->eq('school_id', $sid)->update(['is_current' => true]);
        Supabase::clearCache('terms_' . $sid);
        Supabase::clearCache('term_' . $sid);
        flash('success', 'Active term updated.');
        redirect('settings?tab=academic');
    }

    if ($action === 'edit_term') {
        $termId = input('term_id');
        $name   = input('term_name');
        $start  = input('term_start');
        $end    = input('term_end');
        $due    = input('term_due') ?: $end;
        if ($name && $start && $end) {
            $sb->from('terms')->eq('id', $termId)->eq('school_id', $sid)->update([
                'name'       => $name,
                'start_date' => $start,
                'end_date'   => $end,
                'due_date'   => $due,
                'updated_at' => date('c'),
            ]);
            flash('success', 'Term updated.');
        } else {
            flash('error', 'Name, start date, and end date are required.');
        }
        Supabase::clearCache('terms_' . $sid);
        Supabase::clearCache('term_' . $sid);
        redirect('settings?tab=academic');
    }

    if ($action === 'delete_term') {
        $termId = input('term_id');
        $sb->from('terms')->eq('id', $termId)->eq('school_id', $sid)->delete();
        flash('success', 'Term deleted.');
        Supabase::clearCache('terms_' . $sid);
        Supabase::clearCache('term_' . $sid);
        redirect('settings?tab=academic');
    }

    // ── Subjects ─────────────────────────────────────────
    if ($action === 'add_subject') {
        $name = input('subject_name');
        $code = input('subject_code');
        if ($name) {
            $sb->from('subjects')->insert([
                'school_id' => $sid,
                'name'      => $name,
                'code'      => $code ?: null,
            ]);
            flash('success', 'Subject added.');
        }
        Supabase::clearCache('subjects_' . $sid);
        redirect('settings?tab=subjects');
    }

    if ($action === 'edit_subject') {
        $subId = input('subject_id');
        $name  = input('subject_name');
        $code  = input('subject_code');
        if ($name) {
            $sb->from('subjects')->eq('id', $subId)->eq('school_id', $sid)->update([
                'name' => $name,
                'code' => $code ?: null,
            ]);
            flash('success', 'Subject updated.');
        }
        Supabase::clearCache('subjects_' . $sid);
        redirect('settings?tab=subjects');
    }

    if ($action === 'delete_subject') {
        $subId = input('subject_id');
        $sb->from('subjects')->eq('id', $subId)->eq('school_id', $sid)->delete();
        flash('success', 'Subject deleted.');
        Supabase::clearCache('subjects_' . $sid);
        redirect('settings?tab=subjects');
    }

    // ── Currency & Invoice Settings ──────────────────────
    if ($action === 'update_invoice_settings') {
        // Normalise brand_color to a 6-digit HEX. If the user clears it or pastes
        // junk, fall back to emerald (matches the default everywhere else in the app).
        $brandColor = trim(input('brand_color'));
        if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $brandColor)) {
            $brandColor = '#059669';
        }
        // Notes are free text — keep newlines, trim only trailing whitespace.
        // Hard cap at 500 chars so we never break the print layout.
        $invoiceNotes = mb_substr(rtrim(input('invoice_notes')), 0, 1000);
        $receiptNote  = mb_substr(trim((string)input('receipt_note')), 0, 200);

        $fields = [
            'currency_symbol'        => input('currency_symbol') ?: 'KES',
            'currency_code'          => input('currency_code') ?: 'KES',
            'invoice_prefix'         => input('invoice_prefix') ?: 'INV',
            'default_due_days'       => input('default_due_days') ?: '30',
            'boarding_fee'           => is_numeric(input('boarding_fee')) ? (string)(float)input('boarding_fee') : '0',
            'auto_invoice_on_enroll' => input('auto_invoice_on_enroll') ? 'true' : 'false',
            'activities_billing_mode'=> input('activities_billing_mode') === 'separate' ? 'separate' : 'bundled',
            'kra_pin'                => strtoupper(trim((string)input('kra_pin'))),
            'require_approval_cancel'=> input('require_approval_cancel') ? 'true' : 'false',
            'require_approval_discount'=> input('require_approval_discount') ? 'true' : 'false',
            'require_approval_void_payment'=> input('require_approval_void_payment') ? 'true' : 'false',
            'require_approval_void_expense'=> input('require_approval_void_expense') ? 'true' : 'false',
            'require_approval_credit_note'=> input('require_approval_credit_note') ? 'true' : 'false',
            'payment_void_same_day_only'=> input('payment_void_same_day_only') ? 'true' : 'false',
            'print_paper_size'       => in_array(input('print_paper_size'), ['A4', 'A5'], true) ? input('print_paper_size') : 'A4',
            'brand_color'            => $brandColor,
            'invoice_notes'          => $invoiceNotes,
            'receipt_note'           => $receiptNote,
            // Invoice field visibility — schools differ on what belongs on a
            // fee invoice (e.g. Utawala hides roll numbers). '1' = shown.
            'inv_show_roll'          => input('inv_show_roll') ? '1' : '0',
            'inv_show_due_date'      => input('inv_show_due_date') ? '1' : '0',
            'inv_show_section'       => input('inv_show_section') ? '1' : '0',
            'inv_show_guardian'      => input('inv_show_guardian') ? '1' : '0',
            'inv_show_phone'         => input('inv_show_phone') ? '1' : '0',
            'inv_show_payments'      => input('inv_show_payments') ? '1' : '0',
            'inv_show_disclaimer'    => input('inv_show_disclaimer') ? '1' : '0',
        ];

        foreach ($fields as $key => $value) {
            // Upsert: try update first, insert if not exists
            $existing = $sb->from('school_settings')->select('id')
                ->eq('school_id', $sid)->eq('key', $key)->single()->execute();
            if (!empty($existing['data'])) {
                $sb->from('school_settings')
                    ->eq('school_id', $sid)->eq('key', $key)
                    ->update(['value' => $value, 'updated_at' => date('c')]);
            } else {
                $sb->from('school_settings')->insert([
                    'school_id' => $sid, 'key' => $key, 'value' => $value,
                ]);
            }
        }
        Supabase::clearCache('settings_' . $sid);
        flash('success', 'Invoice settings updated.');
        redirect('settings?tab=invoices');
    }

    // ── Payment Methods ──────────────────────────────────
    if ($action === 'add_payment_method') {
        $name = input('method_name');
        $code = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '_', input('method_code') ?: $name));
        if (!$name) {
            flash('error', 'Payment method name is required.');
        } else {
            // Get max sort order
            $maxSort = $sb->from('payment_methods')->select('sort_order')
                ->eq('school_id', $sid)->order('sort_order', false)->limit(1)->execute();
            $nextSort = (($maxSort['data'][0]['sort_order'] ?? 0) + 1);

            $result = $sb->from('payment_methods')->insert([
                'school_id'  => $sid,
                'name'       => $name,
                'code'       => $code,
                'is_active'  => true,
                'sort_order' => $nextSort,
            ]);
            if ($result['error'] && strpos($result['error'], 'duplicate') !== false) {
                flash('error', 'A payment method with code "' . $code . '" already exists.');
            } else {
                flash('success', 'Payment method added.');
            }
        }
        Supabase::clearCache('payment_methods_' . $sid);
        redirect('settings?tab=methods');
    }

    if ($action === 'toggle_payment_method') {
        $methodId  = input('method_id');
        $newStatus = input('new_status') === 'true';
        $sb->from('payment_methods')->eq('id', $methodId)->eq('school_id', $sid)
            ->update(['is_active' => $newStatus]);
        Supabase::clearCache('payment_methods_' . $sid);
        flash('success', 'Payment method ' . ($newStatus ? 'enabled' : 'disabled') . '.');
        redirect('settings?tab=methods');
    }

    if ($action === 'delete_payment_method') {
        $methodId = input('method_id');
        $sb->from('payment_methods')->eq('id', $methodId)->eq('school_id', $sid)->delete();
        Supabase::clearCache('payment_methods_' . $sid);
        flash('success', 'Payment method deleted.');
        redirect('settings?tab=methods');
    }

    // ── M-Pesa Settings ──────────────────────────────────
    if ($action === 'update_mpesa') {
        $fields = [
            'mpesa_environment'    => input('mpesa_environment') ?: 'sandbox',
            'mpesa_shortcode'      => input('mpesa_shortcode'),
            'mpesa_passkey'        => input('mpesa_passkey'),
            'mpesa_consumer_key'   => input('mpesa_consumer_key'),
            'mpesa_consumer_secret'=> input('mpesa_consumer_secret'),
            'mpesa_callback_url'   => input('mpesa_callback_url'),
        ];

        foreach ($fields as $key => $value) {
            $existing = $sb->from('school_settings')->select('id')
                ->eq('school_id', $sid)->eq('key', $key)->single()->execute();
            if (!empty($existing['data'])) {
                $sb->from('school_settings')
                    ->eq('school_id', $sid)->eq('key', $key)
                    ->update(['value' => $value, 'updated_at' => date('c')]);
            } else {
                $sb->from('school_settings')->insert([
                    'school_id' => $sid, 'key' => $key, 'value' => $value,
                ]);
            }
        }
        Supabase::clearCache('settings_' . $sid);
        flash('success', 'M-Pesa settings updated.');
        redirect('settings?tab=mpesa');
    }

    if ($action === 'update_sms') {
        $fields = [
            'sms_enabled'        => input('sms_enabled') ? '1' : '0',
            'sms_provider'       => in_array(input('sms_provider'), ['textsms', 'africastalking', 'generic'], true)
                                        ? input('sms_provider') : 'textsms',
            'sms_api_key'        => trim((string)input('sms_api_key')),
            'sms_partner_id'     => trim((string)input('sms_partner_id')),
            'sms_username'       => trim((string)input('sms_username')),
            'sms_sender_id'      => trim((string)input('sms_sender_id')),
            'sms_generic_url'    => trim((string)input('sms_generic_url')),
            'sms_generic_method' => strtoupper((string)input('sms_generic_method')) === 'POST' ? 'POST' : 'GET',
        ];
        foreach ($fields as $key => $value) {
            $existing = $sb->from('school_settings')->select('id')
                ->eq('school_id', $sid)->eq('key', $key)->single()->execute();
            if (!empty($existing['data'])) {
                $sb->from('school_settings')->eq('school_id', $sid)->eq('key', $key)
                    ->update(['value' => $value, 'updated_at' => date('c')]);
            } else {
                $sb->from('school_settings')->insert(['school_id' => $sid, 'key' => $key, 'value' => $value]);
            }
        }
        Supabase::clearCache('settings_' . $sid);
        flash('success', 'SMS settings updated.');
        redirect('settings?tab=sms');
    }

    if ($action === 'update_whatsapp') {
        $fields = [
            'wa_enabled'     => input('wa_enabled') ? '1' : '0',
            'wa_token'       => trim((string)input('wa_token')),
            'wa_phone_id'    => trim((string)input('wa_phone_id')),
            'wa_waba_id'     => trim((string)input('wa_waba_id')),
            'wa_template'    => trim((string)input('wa_template')),
            'wa_lang'        => trim((string)input('wa_lang')) ?: 'en',
            'wa_api_version' => trim((string)input('wa_api_version')) ?: 'v21.0',
            // Fee reminders: which template, and which values fill its {{n}} slots in order.
            'wa_reminder_template' => trim((string)input('wa_reminder_template')),
            'wa_reminder_params'   => trim((string)input('wa_reminder_params')) ?: 'message',
            // Two-way (parent assistant): webhook verification + signature secret.
            'wa_verify_token'      => trim((string)input('wa_verify_token')) ?: bin2hex(random_bytes(12)),
            'wa_app_secret'        => trim((string)input('wa_app_secret')),
            'wa_bot_enabled'       => input('wa_bot_enabled') ? '1' : '0',
            // A number on the API can't also be used in the WhatsApp app, so the
            // bot points parents to a human line for everything it can't do.
            'wa_office_phone'      => trim((string)input('wa_office_phone')),
            // Numbers that get Ask Tuta (the Claude assistant) instead of the parent menu.
            'wa_ask_phones'        => trim((string)input('wa_ask_phones')),
        ];
        foreach ($fields as $key => $value) {
            $existing = $sb->from('school_settings')->select('id')
                ->eq('school_id', $sid)->eq('key', $key)->single()->execute();
            if (!empty($existing['data'])) {
                $sb->from('school_settings')->eq('school_id', $sid)->eq('key', $key)
                    ->update(['value' => $value, 'updated_at' => date('c')]);
            } else {
                $sb->from('school_settings')->insert(['school_id' => $sid, 'key' => $key, 'value' => $value]);
            }
        }
        Supabase::clearCache('settings_' . $sid);
        flash('success', 'WhatsApp settings updated.');
        redirect('settings?tab=whatsapp');
    }

    // Send one templated WhatsApp message to verify the Meta credentials work.
    // Templates differ: Meta's starter 'hello_world' takes no variables, while
    // most real ones take at least one. Try with the school name, and if Meta
    // complains about the parameter count, retry with none — so either shape
    // proves the connection.
    // Submit Tuta's standard fee-reminder template to Meta, and point the
    // reminder settings at it. Approval is Meta's — usually minutes.
    // Clear a rejected template so its name can be used again.
    if ($action === 'delete_wa_template') {
        $name = trim((string)input('template_name'));
        $r = whatsappDeleteTemplate($name);
        auditLog('delete_wa_template', 'settings', null, ['name' => $name, 'ok' => !empty($r['ok'])]);
        flash(!empty($r['ok']) ? 'success' : 'error', !empty($r['ok']) ? 'Template "' . $name . '" removed from the account.' : 'Could not remove it: ' . ($r['error'] ?? 'unknown error'));
        redirect('settings?tab=whatsapp#wa-test');
    }

    if ($action === 'create_wa_template') {
        $std = whatsappStandardReminderTemplate();
        // Meta refuses a new template whose name is already taken on the
        // account — even by a rejected one in another language. Clear it first.
        $existing = whatsappListTemplates();
        foreach (($existing['templates'] ?? []) as $t) {
            if ($t['name'] === $std['name'] && $t['status'] !== 'APPROVED') {
                whatsappDeleteTemplate($std['name']);
                break;
            }
        }
        $r = whatsappCreateTemplate($std['name'], $std['language'], $std['category'], $std['body'], $std['examples']);
        if (!empty($r['ok'])) {
            foreach (['wa_reminder_template' => $std['name'], 'wa_reminder_params' => $std['params']] as $key => $value) {
                $existing = $sb->from('school_settings')->select('id')->eq('school_id', $sid)->eq('key', $key)->single()->execute();
                if (!empty($existing['data'])) {
                    $sb->from('school_settings')->eq('school_id', $sid)->eq('key', $key)->update(['value' => $value, 'updated_at' => date('c')]);
                } else {
                    $sb->from('school_settings')->insert(['school_id' => $sid, 'key' => $key, 'value' => $value]);
                }
            }
            Supabase::clearCache('settings_' . $sid);
            auditLog('create_wa_template', 'settings', null, ['name' => $std['name'], 'status' => $r['status']]);
            flash('success', 'Template "' . $std['name'] . '" submitted to Meta (status: ' . strtolower((string)$r['status']) . '). Reminders are now set to use it once it shows as Approved in the list below.');
        } else {
            // Keep Meta's exact words in the log so a failed submission can be read later.
            auditLog('create_wa_template', 'settings', null, ['name' => $std['name'], 'ok' => false, 'error' => (string)($r['error'] ?? 'unknown error')]);
            flash('error', 'Meta did not accept the template: ' . ($r['error'] ?? 'unknown error'));
        }
        redirect('settings?tab=whatsapp#wa-test');
    }

    if ($action === 'test_whatsapp') {
        $phone = trim((string)input('test_wa_phone'));
        // If a reminder template is configured, test THAT with sample values in
        // its slot order — that is what parents will actually receive.
        $rtpl = trim((string)schoolSetting('wa_reminder_template', ''));
        if ($rtpl !== '') {
            $sample = ['guardian' => 'Parent', 'school' => schoolSetting('school_name', 'your school'), 'student' => 'your child',
                       'balance' => 'KES 1,000', 'invoice' => 'TEST-0001', 'days' => '7',
                       'message' => 'This is a test reminder from ' . schoolSetting('school_name', 'your school') . '.'];
            $tokens = array_values(array_filter(array_map('trim', explode(',', (string)schoolSetting('wa_reminder_params', 'message')))));
            $r = whatsappSendText($phone, array_map(fn($t) => (string)($sample[$t] ?? ''), $tokens ?: ['message']), $rtpl);
        } else {
            $r = whatsappSendText($phone, [schoolSetting('school_name', 'your school')]);
            if (empty($r['ok']) && stripos((string)($r['error'] ?? ''), 'param') !== false) {
                $r = whatsappSendText($phone, []);
            }
        }
        if (!empty($r['ok'])) {
            flash('success', 'Test WhatsApp sent to ' . e($phone) . ' — check the handset.');
        } else {
            flash('error', 'Test failed: ' . ($r['error'] ?? 'unknown error'));
        }
        // Keep the outcome AND the reason, so a failed test is diagnosable later.
        auditLog('test_whatsapp', 'settings', null, [
            'ok'    => !empty($r['ok']),
            'phone' => $phone,
            'error' => !empty($r['ok']) ? null : (string)($r['error'] ?? 'unknown error'),
            'id'    => $r['id'] ?? null,
        ]);
        redirect('settings?tab=whatsapp#wa-test');
    }

    // Send one SMS to a given number to verify the provider credentials work.
    if ($action === 'test_sms') {
        $phone = trim((string)input('test_phone'));
        $r = smsSend([$phone], 'Test message from ' . (schoolSetting('school_name', 'your school')) . ' via Tuta. If you received this, SMS is working.');
        if (($r['sent'] ?? 0) > 0) {
            flash('success', 'Test SMS sent to ' . e($phone) . ' — check the handset.');
        } elseif (($r['invalid'] ?? 0) > 0) {
            flash('error', 'That number could not be read. Use the 07XXXXXXXX or 2547XXXXXXXX format.');
        } else {
            flash('error', 'Test failed: ' . ($r['error'] ?? 'the provider rejected the message.'));
        }
        auditLog('test_sms', 'settings', null, ['sent' => $r['sent'] ?? 0, 'failed' => $r['failed'] ?? 0]);
        redirect('settings?tab=sms');
    }

    if ($action === 'test_mpesa') {
        require_once __DIR__ . '/../includes/mpesa.php';
        $mpesa = new MpesaApi();
        if (!$mpesa->isConfigured()) {
            flash('error', 'M-Pesa is not configured. Please save your credentials first.');
        } else {
            $token = $mpesa->getAccessToken();
            if ($token) {
                flash('success', 'M-Pesa connection successful! Access token obtained.');
            } else {
                flash('error', 'M-Pesa connection failed. Check your consumer key and secret.');
            }
        }
        redirect('settings?tab=mpesa');
    }

    // ── C2B URL Registration ─────────────────────────────
    if ($action === 'register_c2b') {
        require_once __DIR__ . '/../includes/mpesa.php';
        $mpesa = new MpesaApi();
        if (!$mpesa->isConfigured()) {
            flash('error', 'M-Pesa credentials must be saved first.');
        } else {
            $baseAppUrl = rtrim(input('app_base_url') ?: '', '/');
            if (!$baseAppUrl) {
                flash('error', 'Please enter your app base URL.');
            } else {
                $validationUrl   = $baseAppUrl . '/?route=api/mpesa/c2b-validation';
                $confirmationUrl = $baseAppUrl . '/?route=api/mpesa/c2b-confirmation';

                $result = $mpesa->registerC2BUrls($validationUrl, $confirmationUrl);
                if ($result['success']) {
                    // Save the URLs to settings
                    foreach ([
                        'mpesa_c2b_validation_url'   => $validationUrl,
                        'mpesa_c2b_confirmation_url' => $confirmationUrl,
                        'mpesa_c2b_registered'       => 'true',
                    ] as $key => $value) {
                        $existing = $sb->from('school_settings')->select('id')
                            ->eq('school_id', $sid)->eq('key', $key)->single()->execute();
                        if (!empty($existing['data'])) {
                            $sb->from('school_settings')
                                ->eq('school_id', $sid)->eq('key', $key)
                                ->update(['value' => $value, 'updated_at' => date('c')]);
                        } else {
                            $sb->from('school_settings')->insert([
                                'school_id' => $sid, 'key' => $key, 'value' => $value,
                            ]);
                        }
                    }
                    Supabase::clearCache('settings_' . $sid);
                    flash('success', 'C2B URLs registered with Safaricom! Parents can now pay directly to your Till/Paybill and payments will auto-record.');
                } else {
                    flash('error', 'C2B registration failed: ' . ($result['error'] ?? 'Unknown error'));
                }
            }
        }
        redirect('settings?tab=mpesa');
    }

    // ── Grading Schemes ──────────────────────────────────
    if ($action === 'add_scheme') {
        $name = input('scheme_name');
        $type = input('scheme_type') === 'marks' ? 'marks' : 'competency';
        if (!$name) {
            flash('error', 'Scheme name is required.');
        } else {
            $sb->from('grading_schemes')->insert([
                'school_id'   => $sid,
                'name'        => $name,
                'scheme_type' => $type,
                'is_default'  => false,
            ]);
            flash('success', 'Grading scheme added.');
        }
        Supabase::clearCache('grading_' . $sid);
        redirect('settings?tab=grading');
    }

    if ($action === 'edit_scheme') {
        $schemeId = input('scheme_id');
        $name     = input('scheme_name');
        $type     = input('scheme_type') === 'marks' ? 'marks' : 'competency';
        if ($name) {
            $sb->from('grading_schemes')->eq('id', $schemeId)->eq('school_id', $sid)->update([
                'name'        => $name,
                'scheme_type' => $type,
                'updated_at'  => date('c'),
            ]);
            flash('success', 'Grading scheme updated.');
        }
        Supabase::clearCache('grading_' . $sid);
        redirect('settings?tab=grading');
    }

    if ($action === 'set_default_scheme') {
        $schemeId = input('scheme_id');
        $sb->from('grading_schemes')->eq('school_id', $sid)->eq('is_default', 'true')
            ->update(['is_default' => false]);
        $sb->from('grading_schemes')->eq('id', $schemeId)->eq('school_id', $sid)
            ->update(['is_default' => true]);
        Supabase::clearCache('grading_' . $sid);
        flash('success', 'Default grading scheme updated.');
        redirect('settings?tab=grading');
    }

    if ($action === 'delete_scheme') {
        $schemeId = input('scheme_id');
        // There must always be a default — block deleting it.
        $check = $sb->from('grading_schemes')->select('is_default')
            ->eq('id', $schemeId)->eq('school_id', $sid)->single()->execute();
        if (!empty($check['data'][0]['is_default'])) {
            flash('error', 'You cannot delete the default scheme. Set another scheme as default first.');
        } else {
            $sb->from('grading_schemes')->eq('id', $schemeId)->eq('school_id', $sid)->delete();
            flash('success', 'Grading scheme deleted.');
        }
        Supabase::clearCache('grading_' . $sid);
        redirect('settings?tab=grading');
    }

    // ── Roles & Permissions: save a role's capabilities (per-school override) ──
    if ($action === 'save_role_caps') {
        $roleKey = trim((string)input('role_key'));
        $label   = trim((string)input('role_label'));
        $caps    = $_POST['caps'] ?? [];
        // Keep only real capabilities from the catalogue (defence in depth).
        $caps    = is_array($caps) ? array_values(array_intersect(array_keys(CAPABILITIES), $caps)) : [];
        if ($roleKey === '') {
            flash('error', 'Missing role.');
            redirect('settings?tab=roles');
        }
        if ($label === '') $label = ucwords(str_replace('_', ' ', $roleKey));
        $existing = $sb->from('school_roles')->select('id')
            ->eq('school_id', $sid)->eq('role_key', $roleKey)->single()->execute();
        if (!empty($existing['data'][0]['id'])) {
            $sb->from('school_roles')->eq('id', $existing['data'][0]['id'])->update([
                'capabilities' => json_encode($caps),
                'label'        => $label,
                'updated_at'   => date('c'),
            ]);
        } else {
            $sb->from('school_roles')->insert([
                'school_id'    => $sid,
                'role_key'     => $roleKey,
                'label'        => $label,
                'capabilities' => json_encode($caps),
                'is_custom'    => false,
            ]);
        }
        auditLog('save_role_caps', 'role', $roleKey, ['capabilities' => $caps]);
        flash('success', 'Permissions updated for ' . $label . '. Users of this role see the change at their next sign-in.');
        redirect('settings?tab=roles');
    }

    // ── Roles & Permissions: create a brand-new custom role ──────────────────
    if ($action === 'create_role') {
        $name = trim((string)input('new_role_name'));
        $caps = $_POST['new_caps'] ?? [];
        $caps = is_array($caps) ? array_values(array_intersect(array_keys(CAPABILITIES), $caps)) : [];
        if ($name === '') {
            flash('error', 'Enter a name for the new role.');
            redirect('settings?tab=roles');
        }
        // Slugify to a stable lowercase key.
        $key = strtolower(preg_replace('/[^a-z0-9]+/i', '_', $name));
        $key = trim($key, '_');
        if ($key === '') {
            flash('error', 'That name has no usable letters — try another.');
            redirect('settings?tab=roles');
        }
        if (array_key_exists($key, roleLabels())) {
            flash('error', 'That matches a built-in role — pick a different name.');
            redirect('settings?tab=roles');
        }
        $dupe = $sb->from('school_roles')->select('id')
            ->eq('school_id', $sid)->eq('role_key', $key)->single()->execute();
        if (!empty($dupe['data'][0]['id'])) {
            flash('error', 'A role named "' . $name . '" already exists.');
            redirect('settings?tab=roles');
        }
        $sb->from('school_roles')->insert([
            'school_id'    => $sid,
            'role_key'     => $key,
            'label'        => $name,
            'capabilities' => json_encode($caps),
            'is_custom'    => true,
        ]);
        auditLog('create_role', 'role', $key, ['label' => $name, 'capabilities' => $caps]);
        flash('success', 'Role "' . $name . '" created. Assign it to staff under Staff & Roles.');
        redirect('settings?tab=roles');
    }

    if ($action === 'add_band' || $action === 'edit_band') {
        $code      = input('band_code');
        $label     = input('band_label');
        $min       = (float)input('band_min');
        $max       = (float)input('band_max');
        $pointsRaw = input('band_points');
        $points    = ($pointsRaw === '') ? null : (int)$pointsRaw;
        $color     = input('band_color') ?: null;

        if (!$code || !$label) {
            flash('error', 'Band code and label are both required.');
        } elseif ($action === 'add_band') {
            $schemeId = input('scheme_id');
            $maxSort  = $sb->from('grading_bands')->select('sort_order')
                ->eq('scheme_id', $schemeId)->order('sort_order', false)->limit(1)->execute();
            $nextSort = (($maxSort['data'][0]['sort_order'] ?? -1) + 1);
            $sb->from('grading_bands')->insert([
                'school_id'   => $sid,
                'scheme_id'   => $schemeId,
                'code'        => $code,
                'label'       => $label,
                'min_percent' => $min,
                'max_percent' => $max,
                'points'      => $points,
                'color'       => $color,
                'sort_order'  => $nextSort,
            ]);
            flash('success', 'Grade band added.');
        } else {
            $bandId = input('band_id');
            $sb->from('grading_bands')->eq('id', $bandId)->eq('school_id', $sid)->update([
                'code'        => $code,
                'label'       => $label,
                'min_percent' => $min,
                'max_percent' => $max,
                'points'      => $points,
                'color'       => $color,
            ]);
            flash('success', 'Grade band updated.');
        }
        Supabase::clearCache('grading_' . $sid);
        redirect('settings?tab=grading');
    }

    if ($action === 'delete_band') {
        $bandId = input('band_id');
        $sb->from('grading_bands')->eq('id', $bandId)->eq('school_id', $sid)->delete();
        Supabase::clearCache('grading_' . $sid);
        flash('success', 'Grade band deleted.');
        redirect('settings?tab=grading');
    }

    if ($action === 'update_ranking') {
        $value = input('show_class_rank') ? 'true' : 'false';
        $existing = $sb->from('school_settings')->select('id')
            ->eq('school_id', $sid)->eq('key', 'show_class_rank')->single()->execute();
        if (!empty($existing['data'])) {
            $sb->from('school_settings')->eq('school_id', $sid)->eq('key', 'show_class_rank')
                ->update(['value' => $value, 'updated_at' => date('c')]);
        } else {
            $sb->from('school_settings')->insert([
                'school_id' => $sid, 'key' => 'show_class_rank', 'value' => $value,
            ]);
        }
        Supabase::clearCache('settings_' . $sid);
        flash('success', 'Ranking preference updated.');
        redirect('settings?tab=grading');
    }

    if ($action === 'update_money_visibility') {
        $value = input('dashboard_money_admins_only') ? 'true' : 'false';
        $existing = $sb->from('school_settings')->select('id')
            ->eq('school_id', $sid)->eq('key', 'dashboard_money_admins_only')->single()->execute();
        if (!empty($existing['data'])) {
            $sb->from('school_settings')->eq('school_id', $sid)->eq('key', 'dashboard_money_admins_only')
                ->update(['value' => $value, 'updated_at' => date('c')]);
        } else {
            $sb->from('school_settings')->insert([
                'school_id' => $sid, 'key' => 'dashboard_money_admins_only', 'value' => $value,
            ]);
        }
        Supabase::clearCache('settings_' . $sid);
        flash('success', $value === 'true' ? 'Dashboard money totals are now visible to administrators only.'
                                           : 'Dashboard money totals follow role permissions again.');
        redirect('settings?tab=permissions');
    }

    // ── Staff & Roles ────────────────────────────────────
    if ($action === 'update_user_role') {
        $usId         = input('user_school_id');
        $newRole      = input('new_role');
        $targetUserId = input('target_user_id');
        if (!array_key_exists($newRole, schoolRoleLabels($sid))) {
            flash('error', 'Invalid role.');
        } elseif ($targetUserId !== '' && $targetUserId === ($_SESSION['user_id'] ?? '')) {
            flash('error', 'You cannot change your own role — ask another administrator.');
        } else {
            $sb->from('user_schools')->eq('id', $usId)->eq('school_id', $sid)
                ->update(['role' => $newRole]);
            flash('success', 'Role updated.');
        }
        redirect('settings?tab=staff');
    }

    if ($action === 'invite_staff') {
        $email = strtolower(trim(input('invite_email')));
        $role  = input('invite_role');
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', 'A valid email address is required.');
        } elseif (!array_key_exists($role, schoolRoleLabels($sid))) {
            flash('error', 'Please choose a role for the new staff member.');
        } else {
            $token  = bin2hex(random_bytes(24));
            $school = cachedSchool();
            $user   = currentUser();
            $res = $sb->from('invitations')->insert([
                'email'       => $email,
                'school_id'   => $sid,
                'school_name' => $school['name'] ?? '',
                'role'        => $role,
                'token'       => $token,
                'invited_by'  => $user['id'] ?? null,
            ]);
            if (!empty($res['error'])) {
                flash('error', 'Could not create invitation: ' . $res['error']);
            } else {
                $mail = sendInvitationEmail($email, $school['name'] ?? '', $role, inviteUrl($token, currentTenantBaseUrl()));
                if ($mail['ok']) {
                    flash('success', 'Invitation emailed to ' . $email . '.');
                } else {
                    flash('success', 'Invitation created for ' . $email . '. '
                        . (mailEnabled()
                            ? 'The email could not be sent (' . $mail['error'] . ') — '
                            : 'Automatic email is off — ')
                        . 'copy its link from the Pending list below and send it.');
                }
            }
        }
        redirect('settings?tab=staff');
    }

    if ($action === 'cancel_invitation') {
        $invId = input('invitation_id');
        $sb->from('invitations')->eq('id', $invId)->eq('school_id', $sid)->delete();
        flash('success', 'Invitation cancelled.');
        redirect('settings?tab=staff');
    }

    if ($action === 'resend_invitation') {
        $invId  = input('invitation_id');
        $invRes = $sb->from('invitations')->select('*')->eq('id', $invId)->eq('school_id', $sid)->single()->execute();
        $inv    = $invRes['data'][0] ?? null;
        if (!$inv) {
            flash('error', 'Invitation not found.');
        } elseif (!empty($inv['accepted_at'])) {
            flash('error', 'That invitation has already been accepted.');
        } else {
            $school     = cachedSchool();
            $schoolName = ($inv['school_name'] ?? '') ?: ($school['name'] ?? '');
            $mail = sendInvitationEmail($inv['email'], $schoolName, $inv['role'] ?? 'teacher',
                inviteUrl($inv['token'], currentTenantBaseUrl()));
            flash($mail['ok'] ? 'success' : 'error',
                $mail['ok'] ? 'Invitation re-sent to ' . $inv['email'] . '.'
                            : 'Could not send (' . $mail['error'] . '). Use Copy link instead.');
        }
        redirect('settings?tab=staff');
    }

    if ($action === 'remove_staff') {
        $usId         = input('user_school_id');
        $targetUserId = input('target_user_id');
        if ($targetUserId !== '' && $targetUserId === ($_SESSION['user_id'] ?? '')) {
            flash('error', 'You cannot remove yourself from the school.');
        } else {
            $sb->from('user_schools')->eq('id', $usId)->eq('school_id', $sid)->delete();
            flash('success', 'Staff member removed from this school.');
        }
        redirect('settings?tab=staff');
    }

    if ($action === 'add_teacher_assignment') {
        $userId    = input('teacher_user_id');
        $classId   = input('teacher_class_id');
        $subjectId = input('teacher_subject_id');
        if ($userId === '' || $classId === '' || $subjectId === '') {
            flash('error', 'Pick a teacher, a class, and a subject.');
        } elseif (assignSubjectTeacher($userId, $classId, $subjectId)) {
            flash('success', 'Subject assignment saved.');
        } else {
            flash('error', 'Could not save the assignment.');
        }
        redirect('settings?tab=teachers&teacher=' . urlencode($userId));
    }

    if ($action === 'remove_teacher_assignment') {
        $assignId  = input('assignment_id');
        $teacherId = input('teacher_user_id');
        if ($assignId !== '' && unassignSubjectTeacher($assignId)) {
            flash('success', 'Assignment removed.');
        } else {
            flash('error', 'Could not remove the assignment.');
        }
        redirect('settings?tab=teachers' . ($teacherId ? '&teacher=' . urlencode($teacherId) : ''));
    }
}

// Fetch data
$schoolData = cachedSchool() ?? [];
$years      = cachedYears();
$terms      = cachedTerms();
$subjects   = cachedSubjects();
$settings   = cachedSchoolSettings();

// Get all payment methods (including inactive) for the management tab
$allMethodsResult = $sb->from('payment_methods')->select('id,name,code,is_active,sort_order')
    ->eq('school_id', $sid)->order('sort_order')->execute();
$allMethods = $allMethodsResult['data'] ?? [];

// Grading schemes — only loaded for that tab; starters are seeded on first visit.
$gradingData = ['schemes' => [], 'default' => null];
if ($activeTab === 'grading') {
    $gradingData = cachedGradingData();
    if (empty($gradingData['schemes'])) {
        seedGradingSchemes($sid);
        $gradingData = cachedGradingData();
    }
}

// Staff & roles — only loaded for that tab.
$staffUsers   = [];
$staffInvites = [];
if ($activeTab === 'staff') {
    $usRes = $sb->from('user_schools')->select('id,user_id,role,created_at')
        ->eq('school_id', $sid)->order('created_at')->execute();
    $staffUsers = $usRes['data'] ?? [];

    // Names from user_profiles (best-effort — a profile row may not exist).
    $uids = array_values(array_filter(array_column($staffUsers, 'user_id')));
    $profileMap = [];
    if (!empty($uids)) {
        $pRes = $sb->from('user_profiles')->select('id,full_name,phone')
            ->in('id', $uids)->execute();
        foreach (($pRes['data'] ?? []) as $p) $profileMap[$p['id']] = $p;
    }
    // Emails from Auth — the reliable identifier, since profile names are
    // often blank for invited/migrated staff. Staff lists are small, so one
    // admin lookup each is fine.
    $emailMap = []; $lastLoginMap = [];
    foreach ($uids as $uid) {
        $au = $sb->adminGetUser($uid);
        $em = $au['data']['email'] ?? '';
        if ($em) $emailMap[$uid] = $em;
        $lastLoginMap[$uid] = $au['data']['last_sign_in_at'] ?? null;
    }
    foreach ($staffUsers as &$_u) {
        $_u['name']       = $profileMap[$_u['user_id']]['full_name'] ?? '';
        $_u['phone']      = $profileMap[$_u['user_id']]['phone'] ?? '';
        $_u['email']      = $emailMap[$_u['user_id']] ?? '';
        $_u['last_login'] = $lastLoginMap[$_u['user_id']] ?? null;
    }
    unset($_u);

    // Pending (unaccepted) invitations.
    $invRes = $sb->from('invitations')->select('id,email,role,token,accepted_at,expires_at,created_at')
        ->eq('school_id', $sid)->is('accepted_at', 'null')->order('created_at', false)->execute();
    $staffInvites = $invRes['data'] ?? [];
}

// ── Teachers tab data ─────────────────────────────────────────────────
$teachersTabData = null;
if ($activeTab === 'teachers') {
    $teachingStaff = cachedTeachingStaff();

    // All subject_teachers rows for this school, grouped by user_id.
    $allAssigns = $sb->from('subject_teachers')->select('id,user_id,class_id,subject_id')
        ->eq('school_id', $sid)->execute();
    $assignsByUser = [];
    foreach (($allAssigns['data'] ?? []) as $a) {
        $assignsByUser[$a['user_id']][] = $a;
    }

    // Classes + class-teacher of mapping.
    $clsRes = $sb->from('classes')->select('id,name,level,class_teacher_id')
        ->eq('school_id', $sid)->order('level')->execute();
    $allClassesT = $clsRes['data'] ?? [];
    $classTeacherOf = [];
    foreach ($allClassesT as $c) {
        if (!empty($c['class_teacher_id'])) {
            $classTeacherOf[$c['class_teacher_id']][] = $c;
        }
    }

    // Lookup maps.
    $classNameMapT = [];
    foreach ($allClassesT as $c) $classNameMapT[$c['id']] = $c['name'];
    $allSubsList = cachedSubjects();
    $subjectNameMapT = [];
    foreach ($allSubsList as $s) $subjectNameMapT[$s['id']] = $s['name'];

    // class_subjects (which subjects each class takes) for the Add form dropdown.
    $teachersClassSubjects = [];
    $csResT = $sb->from('class_subjects')->select('class_id,subject_id')
        ->eq('school_id', $sid)->execute();
    foreach (($csResT['data'] ?? []) as $r) {
        $teachersClassSubjects[$r['class_id']][] = $r['subject_id'];
    }

    $teachersTabData = [
        'staff'            => $teachingStaff,
        'assignsByUser'    => $assignsByUser,
        'classTeacherOf'   => $classTeacherOf,
        'classNameMap'     => $classNameMapT,
        'subjectNameMap'   => $subjectNameMapT,
        'allClasses'       => $allClassesT,
        'classSubjects'    => $teachersClassSubjects,
    ];
}

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Settings</h1>
    <p class="text-sm text-gray-500 mt-1">Manage school profile, academics, fees, and integrations</p>
</div>

<!-- Tab Navigation -->
<div class="flex flex-wrap gap-1 mb-6 bg-white rounded-xl border border-gray-100 p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <?php
    $tabs = [
        'profile'  => ['label' => 'School Profile', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>'],
        'academic' => ['label' => 'Academic', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>'],
        'subjects' => ['label' => 'Subjects', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>'],
        'grading'  => ['label' => 'Grading', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>'],
        'staff'    => ['label' => 'Staff & Roles', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2-5.24"/>'],
        'roles'    => ['label' => 'Permissions', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>'],
        'teachers' => ['label' => 'Teachers', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>'],
        'invoices' => ['label' => 'Currency & Invoices', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"/>'],
        'methods'  => ['label' => 'Payment Methods', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>'],
        'mpesa'    => ['label' => 'M-Pesa', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>'],
        'sms'      => ['label' => 'SMS', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.4 7.2L3 21l1.8-6.6A8 8 0 1121 12z"/>'],
        'whatsapp' => ['label' => 'WhatsApp', 'icon' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 21l1.9-5.6A8.4 8.4 0 1121 12a8.4 8.4 0 01-12.5 7.3L3 21z"/>'],
    ];
    foreach ($tabs as $key => $tab):
        $isActive = ($activeTab === $key);
    ?>
        <a href="<?= baseUrl('settings?tab=' . $key) ?>"
           class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition
                  <?= $isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50' ?>">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><?= $tab['icon'] ?></svg>
            <?= $tab['label'] ?>
        </a>
    <?php endforeach; ?>
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: School Profile                                     -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php if ($activeTab === 'profile'): ?>

<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <h2 class="text-sm font-semibold text-gray-700 mb-2">School Profile</h2>
    <p class="text-xs text-gray-400 mb-4">This information appears on printed invoices, receipts, and report cards.</p>
    <form method="POST" enctype="multipart/form-data">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="update_school">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="md:col-span-2 flex items-start gap-5">
                <div class="flex-shrink-0">
                    <?php if (!empty($schoolData['logo_url'])): ?>
                        <img src="<?= e($schoolData['logo_url']) ?>" alt="Logo" class="w-20 h-20 object-contain rounded-lg border border-gray-200">
                    <?php else: ?>
                        <div class="w-20 h-20 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                            <span class="text-white text-2xl font-bold"><?= e(strtoupper(substr($schoolData['name'] ?? 'S', 0, 2))) ?></span>
                        </div>
                    <?php endif; ?>
                </div>
                <div class="flex-1">
                    <label class="block text-sm font-medium text-gray-700 mb-1">School Name *</label>
                    <input type="text" name="school_name" required value="<?= e($schoolData['name'] ?? '') ?>"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                </div>
            </div>
            <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">School Logo</label>
                <input type="file" name="school_logo_file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    class="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium file:cursor-pointer hover:file:bg-emerald-100">
                <p class="text-xs text-gray-400 mt-1">PNG, JPG, WEBP or SVG. Maximum 2 MB. Uploading a new file replaces the current logo.</p>
                <?php if (!empty($schoolData['logo_url'])): ?>
                    <label class="inline-flex items-center gap-2 mt-3 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" name="remove_logo" value="1" class="rounded border-gray-300 text-red-600 focus:ring-red-500">
                        <span>Remove the current logo</span>
                    </label>
                <?php endif; ?>
            </div>
            <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" name="school_address" value="<?= e($schoolData['address'] ?? '') ?>" placeholder="P.O. Box 123, Nairobi, Kenya"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" name="school_phone" value="<?= e($schoolData['phone'] ?? '') ?>" placeholder="+254 700 000 000"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" name="school_email" value="<?= e($schoolData['email'] ?? '') ?>" placeholder="info@school.com"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
        </div>
        <div class="mt-4 pt-4 border-t border-gray-100">
            <label class="block text-sm font-medium text-gray-700 mb-1">Portal &amp; login domain <span class="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" name="school_domain" value="<?= e($schoolData['domain'] ?? '') ?>" placeholder="e.g. crownofgold.tutagora.com"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">Your school's own web address for staff login and the parent portal — e.g. <span class="font-mono">crownofgold.tutagora.com</span> (parents then use <span class="font-mono">/portal</span>). Point its DNS to this app with SSL first; once set, it's used in every invite, receipt and statement link. Leave blank to use the shared address.</p>
        </div>
        <button type="submit" class="mt-4 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save Profile</button>
    </form>
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Academic Years & Terms                             -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'academic'): ?>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- Academic Years -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-4">Academic Years</h2>
        <div class="space-y-2 mb-4">
            <?php foreach ($years as $y): ?>
                <div class="flex items-center justify-between py-2 px-3 rounded-lg <?= ($y['is_current'] ?? false) ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50' ?>">
                    <div>
                        <span class="font-medium text-sm text-gray-900"><?= e($y['name']) ?></span>
                        <?php if ($y['is_current'] ?? false): ?>
                            <span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Current</span>
                        <?php endif; ?>
                        <?php if ($y['start_date']): ?>
                            <span class="ml-1 text-xs text-gray-400"><?= formatDate($y['start_date']) ?> — <?= formatDate($y['end_date'] ?? '') ?></span>
                        <?php endif; ?>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="editYear('<?= e($y['id']) ?>','<?= e(addslashes($y['name'])) ?>','<?= e($y['start_date'] ?? '') ?>','<?= e($y['end_date'] ?? '') ?>')" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <?php if (!($y['is_current'] ?? false)): ?>
                            <form method="POST" class="inline">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="set_current_year">
                                <input type="hidden" name="year_id" value="<?= e($y['id']) ?>">
                                <button type="submit" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Set Current</button>
                            </form>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
            <?php if (empty($years)): ?>
                <p class="text-sm text-gray-400">No academic years yet.</p>
            <?php endif; ?>
        </div>
        <form method="POST" class="border-t border-gray-100 pt-4">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_year">
            <div class="mb-2">
                <input type="text" name="year_name" required placeholder="e.g. 2026"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="date" name="year_start" required title="Start date"
                    class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <input type="date" name="year_end" required title="End date"
                    class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <button type="submit" class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add Year</button>
        </form>
    </div>

    <!-- Terms -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-4">Terms</h2>
        <div class="space-y-2 mb-4">
            <?php foreach ($terms as $t): ?>
                <div class="flex items-center justify-between py-2 px-3 rounded-lg <?= ($t['is_current'] ?? false) ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50' ?>">
                    <div>
                        <span class="font-medium text-sm text-gray-900"><?= e($t['name']) ?></span>
                        <?php if ($t['is_current'] ?? false): ?>
                            <span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Active</span>
                        <?php endif; ?>
                        <?php if ($t['start_date']): ?>
                            <span class="ml-2 text-xs text-gray-400"><?= formatDate($t['start_date']) ?></span>
                        <?php endif; ?>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="editTerm('<?= e($t['id']) ?>','<?= e(addslashes($t['name'])) ?>','<?= e($t['start_date'] ?? '') ?>','<?= e($t['end_date'] ?? '') ?>')" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <?php if (!($t['is_current'] ?? false)): ?>
                            <form method="POST" class="inline">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="set_current_term">
                                <input type="hidden" name="term_id" value="<?= e($t['id']) ?>">
                                <button type="submit" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Set Active</button>
                            </form>
                        <?php endif; ?>
                        <form method="POST" class="inline" onsubmit="return confirm('Delete this term?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="delete_term">
                            <input type="hidden" name="term_id" value="<?= e($t['id']) ?>">
                            <button type="submit" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                        </form>
                    </div>
                </div>
            <?php endforeach; ?>
            <?php if (empty($terms)): ?>
                <p class="text-sm text-gray-400">No terms yet.</p>
            <?php endif; ?>
        </div>
        <form method="POST" class="border-t border-gray-100 pt-4">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_term">
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="text" name="term_name" required placeholder="e.g. Term 1"
                    class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <select name="term_year_id" required class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="">Academic Year *</option>
                    <?php foreach ($years as $y): ?>
                        <option value="<?= e($y['id']) ?>"><?= e($y['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-2">
                <input type="date" name="term_start" required title="Start date"
                    class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <input type="date" name="term_end" required title="End date"
                    class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="mb-2">
                <input type="date" name="term_due" title="Fee due date"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <p class="text-xs text-gray-400 mt-1">Fee due date (defaults to end date if empty)</p>
            </div>
            <button type="submit" class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add Term</button>
        </form>
    </div>
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Subjects                                           -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'subjects'): ?>

<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <h2 class="text-sm font-semibold text-gray-700 mb-4">Subjects</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
        <?php foreach ($subjects as $sub): ?>
            <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                <div>
                    <span class="text-sm font-medium text-gray-900"><?= e($sub['name']) ?></span>
                    <?php if ($sub['code']): ?>
                        <span class="ml-1 text-xs text-gray-400">(<?= e($sub['code']) ?>)</span>
                    <?php endif; ?>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="editSubject('<?= e($sub['id']) ?>','<?= e(addslashes($sub['name'])) ?>','<?= e(addslashes($sub['code'] ?? '')) ?>')" class="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                    <form method="POST" class="inline" onsubmit="return confirm('Delete?')">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="delete_subject">
                        <input type="hidden" name="subject_id" value="<?= e($sub['id']) ?>">
                        <button type="submit" class="text-red-400 hover:text-red-600 text-xs ml-1">Delete</button>
                    </form>
                </div>
            </div>
        <?php endforeach; ?>
        <?php if (empty($subjects)): ?>
            <p class="text-sm text-gray-400 col-span-full">No subjects yet.</p>
        <?php endif; ?>
    </div>
    <form method="POST" class="border-t border-gray-100 pt-4">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="add_subject">
        <div class="flex gap-2">
            <input type="text" name="subject_name" required placeholder="Subject name (e.g. Mathematics)"
                class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <input type="text" name="subject_code" placeholder="Code (e.g. MATH)"
                class="w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <button type="submit" class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add</button>
        </div>
    </form>
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Grading Schemes                                    -->
<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Roles & Permissions                                -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'roles'): ?>
<?php
// System defaults + this school's overrides → the effective grid.
$roleDefs       = $sb->from('role_defaults')->select('role_key,label,capabilities')->execute()['data'] ?? [];
$schoolRoleRows = $sb->from('school_roles')->select('role_key,label,capabilities,is_custom')->eq('school_id', $sid)->execute()['data'] ?? [];
$overrides = [];
foreach ($schoolRoleRows as $r) $overrides[$r['role_key']] = $r;
$decodeCaps = function ($c) { return is_array($c) ? $c : (json_decode((string)$c, true) ?: []); };
$rolesForGrid = [];
// Built-in roles (with any per-school override applied)
foreach ($roleDefs as $rd) {
    if ($rd['role_key'] === 'parent') continue; // parents aren't staff
    $ov  = $overrides[$rd['role_key']] ?? null;
    $rolesForGrid[$rd['role_key']] = [
        'label'      => $ov['label'] ?? $rd['label'],
        'caps'       => $decodeCaps($ov['capabilities'] ?? $rd['capabilities'] ?? []),
        'overridden' => $ov !== null,
        'custom'     => false,
    ];
}
// Custom roles this school created (present only in school_roles)
foreach ($schoolRoleRows as $r) {
    if (!empty($r['is_custom']) && !isset($rolesForGrid[$r['role_key']])) {
        $rolesForGrid[$r['role_key']] = [
            'label'      => $r['label'] ?? $r['role_key'],
            'caps'       => $decodeCaps($r['capabilities'] ?? []),
            'overridden' => true,
            'custom'     => true,
        ];
    }
}
?>
<div class="space-y-4">
    <?php $moneyAdminsOnly = schoolSetting('dashboard_money_admins_only', 'false') === 'true'; ?>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <form method="POST" class="flex items-start justify-between gap-6">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="update_money_visibility">
            <div>
                <h2 class="text-sm font-semibold text-gray-700 mb-1">Money on the dashboard</h2>
                <p class="text-xs text-gray-400 max-w-xl">When on, the collected, outstanding and collection-rate figures, the fee chart and payment amounts are shown to administrators only. Everyone else keeps the dashboard without the money. Off by default — visibility then follows each role's <em>See money totals</em> permission below.</p>
            </div>
            <label class="inline-flex items-center gap-2 cursor-pointer shrink-0 mt-0.5">
                <input type="checkbox" name="dashboard_money_admins_only" value="1" <?= $moneyAdminsOnly ? 'checked' : '' ?> onchange="this.form.submit()" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-400">
                <span class="text-xs font-medium text-gray-600"><?= $moneyAdminsOnly ? 'Admins only' : 'By role' ?></span>
            </label>
        </form>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-1">Roles &amp; Permissions</h2>
        <p class="text-xs text-gray-400 mb-4">Tick what each role can do. <strong>Administrators always have full access</strong> and aren't listed. Changes apply to a user at their next sign-in.</p>

        <!-- Create a brand-new custom role -->
        <details class="mb-5 border border-emerald-100 bg-emerald-50/40 rounded-lg p-4">
            <summary class="text-sm font-semibold text-emerald-800 cursor-pointer">+ Create a new role</summary>
            <form method="POST" class="mt-3">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="create_role">
                <label class="block text-sm font-medium text-gray-700 mb-1">Role name</label>
                <input type="text" name="new_role_name" required maxlength="40"
                       placeholder="e.g. Librarian, Nurse, Transport Manager"
                       class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm mb-3">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">What can this role do?</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                    <?php foreach (CAPABILITIES as $capKey => $capLabel): ?>
                    <label class="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" name="new_caps[]" value="<?= e($capKey) ?>"
                               class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                        <span class="text-gray-700 leading-tight"><?= e($capLabel) ?></span>
                    </label>
                    <?php endforeach; ?>
                </div>
                <button type="submit" class="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Create role</button>
            </form>
        </details>

        <?php foreach ($rolesForGrid as $rkey => $role): ?>
        <form method="POST" class="mb-3 border border-gray-100 rounded-lg p-4">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="save_role_caps">
            <input type="hidden" name="role_key" value="<?= e($rkey) ?>">
            <input type="hidden" name="role_label" value="<?= e($role['label']) ?>">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-800"><?= e($role['label']) ?>
                    <?php if (!empty($role['custom'])): ?><span class="text-[10px] font-medium text-purple-600 ml-1">· custom</span>
                    <?php elseif ($role['overridden']): ?><span class="text-[10px] font-medium text-emerald-600 ml-1">· customised</span><?php endif; ?>
                </h3>
                <button type="submit" class="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save</button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <?php foreach (CAPABILITIES as $capKey => $capLabel): ?>
                <label class="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="caps[]" value="<?= e($capKey) ?>"
                           <?= in_array($capKey, $role['caps'], true) ? 'checked' : '' ?>
                           class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-gray-700 leading-tight"><?= e($capLabel) ?></span>
                </label>
                <?php endforeach; ?>
            </div>
        </form>
        <?php endforeach; ?>
    </div>
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'grading'): ?>

<div class="space-y-4">

    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-1">Grading Schemes</h2>
        <p class="text-xs text-gray-400">A grading scheme turns a percentage score into a grade. The scheme marked <span class="font-medium text-emerald-600">Default</span> is used everywhere grades appear — Grade Entry and Report Cards. Competency schemes use levels (EE / ME / AE / BE) for CBC; marks schemes use letter grades.</p>
    </div>

    <?php $showRank = schoolSetting('show_class_rank', 'false') === 'true'; ?>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <form method="POST" class="flex items-start justify-between gap-4">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="update_ranking">
            <div>
                <h2 class="text-sm font-semibold text-gray-700 mb-1">Class Ranking</h2>
                <p class="text-xs text-gray-400 max-w-xl">Show each student's position in class on report cards and the Analysis page. Off by default — CBC discourages ranking learners, but marks-based schools often want it.</p>
            </div>
            <label class="inline-flex items-center gap-2 cursor-pointer shrink-0 mt-0.5">
                <input type="checkbox" name="show_class_rank" value="1" <?= $showRank ? 'checked' : '' ?> onchange="this.form.submit()" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-400">
                <span class="text-xs font-medium text-gray-600"><?= $showRank ? 'On' : 'Off' ?></span>
            </label>
        </form>
    </div>

    <?php foreach ($gradingData['schemes'] as $scheme): ?>
        <?php $isDefault = !empty($scheme['is_default']); ?>
        <div class="bg-white rounded-xl border <?= $isDefault ? 'border-emerald-200' : 'border-gray-100' ?> p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-2">
                    <h3 class="text-sm font-semibold text-gray-900"><?= e($scheme['name']) ?></h3>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        <?= ($scheme['scheme_type'] ?? '') === 'marks' ? 'Marks' : 'Competency' ?>
                    </span>
                    <?php if ($isDefault): ?>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Default</span>
                    <?php endif; ?>
                </div>
                <div class="flex items-center gap-2">
                    <?php if (!$isDefault): ?>
                        <form method="POST" class="inline">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="set_default_scheme">
                            <input type="hidden" name="scheme_id" value="<?= e($scheme['id']) ?>">
                            <button type="submit" class="text-xs font-medium text-emerald-600 hover:text-emerald-800">Set as Default</button>
                        </form>
                    <?php endif; ?>
                    <button onclick="editScheme('<?= e($scheme['id']) ?>','<?= e(addslashes($scheme['name'])) ?>','<?= e($scheme['scheme_type'] ?? 'competency') ?>')" class="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                    <?php if (!$isDefault): ?>
                        <form method="POST" class="inline" onsubmit="return confirm('Delete this scheme and all its bands?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="delete_scheme">
                            <input type="hidden" name="scheme_id" value="<?= e($scheme['id']) ?>">
                            <button type="submit" class="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                        </form>
                    <?php endif; ?>
                </div>
            </div>

            <div class="rounded-lg border border-gray-100 overflow-hidden">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                            <th class="text-left px-3 py-2 font-semibold">Grade</th>
                            <th class="text-left px-3 py-2 font-semibold">Label</th>
                            <th class="text-center px-3 py-2 font-semibold">Score range</th>
                            <th class="text-center px-3 py-2 font-semibold">Points</th>
                            <th class="text-right px-3 py-2 font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                        <?php foreach ($scheme['bands'] as $band): ?>
                            <tr>
                                <td class="px-3 py-2">
                                    <span class="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                                        <span class="w-2.5 h-2.5 rounded-full" style="background-color: <?= e($band['color'] ?: '#9ca3af') ?>;"></span>
                                        <?= e($band['code']) ?>
                                    </span>
                                </td>
                                <td class="px-3 py-2 text-gray-600"><?= e($band['label']) ?></td>
                                <td class="px-3 py-2 text-center text-gray-600"><?= rtrim(rtrim(number_format((float)$band['min_percent'], 1), '0'), '.') ?>–<?= rtrim(rtrim(number_format((float)$band['max_percent'], 1), '0'), '.') ?>%</td>
                                <td class="px-3 py-2 text-center text-gray-500"><?= ($band['points'] !== null && $band['points'] !== '') ? (int)$band['points'] : '—' ?></td>
                                <td class="px-3 py-2 text-right whitespace-nowrap">
                                    <button onclick="bandModal('edit_band','<?= e($scheme['id']) ?>','<?= e($band['id']) ?>','<?= e(addslashes($band['code'])) ?>','<?= e(addslashes($band['label'])) ?>','<?= e($band['min_percent']) ?>','<?= e($band['max_percent']) ?>','<?= e((string)($band['points'] ?? '')) ?>','<?= e($band['color'] ?? '') ?>')" class="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                                    <form method="POST" class="inline" onsubmit="return confirm('Delete this band?')">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="action" value="delete_band">
                                        <input type="hidden" name="band_id" value="<?= e($band['id']) ?>">
                                        <button type="submit" class="text-xs font-medium text-red-500 hover:text-red-700 ml-1">Delete</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (empty($scheme['bands'])): ?>
                            <tr><td colspan="5" class="px-3 py-4 text-center text-gray-400 text-xs">No grade bands yet — add one below.</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
            <div class="mt-3">
                <button onclick="bandModal('add_band','<?= e($scheme['id']) ?>','','','','','','','')" class="text-xs font-medium text-emerald-600 hover:text-emerald-800">+ Add grade band</button>
            </div>
        </div>
    <?php endforeach; ?>

    <!-- Add scheme -->
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Add a Grading Scheme</h3>
        <form method="POST" class="flex flex-wrap gap-2 items-center">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_scheme">
            <input type="text" name="scheme_name" required placeholder="Scheme name"
                class="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <select name="scheme_type" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="competency">Competency (EE / ME / AE / BE)</option>
                <option value="marks">Marks (letter grades)</option>
            </select>
            <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add Scheme</button>
        </form>
        <p class="text-xs text-gray-400 mt-2">After adding a scheme, add its grade bands, then set it as the default to make it active.</p>
    </div>

</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Staff & Roles                                      -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'staff'): ?>

<?php
$staffRoleOptions = schoolRoleLabels($sid);
unset($staffRoleOptions['platform_admin'], $staffRoleOptions['parent']);
$currentUserId = $_SESSION['user_id'] ?? '';
$appUrl = defined('APP_URL') ? rtrim(APP_URL, '/') : '';
?>

<div class="space-y-4">

    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-1">Staff Members</h2>
        <p class="text-xs text-gray-400 mb-4">Everyone with access to this school. A person's role controls what they can see and do.</p>
        <div class="space-y-2">
            <?php foreach ($staffUsers as $u): ?>
                <?php
                $isMe        = ($u['user_id'] === $currentUserId);
                $uRole       = normalizeRole($u['role'] ?? '');
                // Prefer the real name; fall back to email so the row is always identifiable.
                $displayName = $u['name'] !== '' ? $u['name'] : ($u['email'] !== '' ? $u['email'] : 'Staff member');
                $showEmail   = ($u['name'] !== '' && $u['email'] !== '');   // avoid repeating when email is the title
                ?>
                <div class="flex flex-wrap items-center justify-between gap-3 py-3 px-4 rounded-lg bg-gray-50">
                    <div class="min-w-0">
                        <span class="text-sm font-medium text-gray-900"><?= e($displayName) ?></span>
                        <?php if ($isMe): ?><span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">You</span><?php endif; ?>
                        <?php if (empty($u['last_login'])): ?><span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700" title="This account has never signed in">Not signed in yet</span><?php endif; ?>
                        <?php if ($showEmail): ?><span class="ml-2 text-xs text-gray-400"><?= e($u['email']) ?></span><?php endif; ?>
                        <?php if (!empty($u['phone'])): ?><span class="ml-2 text-xs text-gray-400"><?= e($u['phone']) ?></span><?php endif; ?>
                        <div class="text-xs text-gray-400 mt-0.5">Current role: <span class="font-medium text-gray-500"><?= e(roleLabel($uRole)) ?></span></div>
                    </div>
                    <div class="flex items-center gap-2">
                        <?php if ($isMe): ?>
                            <span class="text-xs text-gray-400 italic">Your own role can't be changed here</span>
                        <?php else: ?>
                            <form method="POST" class="flex items-center gap-2">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="update_user_role">
                                <input type="hidden" name="user_school_id" value="<?= e($u['id']) ?>">
                                <input type="hidden" name="target_user_id" value="<?= e($u['user_id']) ?>">
                                <select name="new_role" class="px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                                    <?php foreach ($staffRoleOptions as $rKey => $rLabel): ?>
                                        <option value="<?= e($rKey) ?>"<?= $rKey === $uRole ? ' selected' : '' ?>><?= e($rLabel) ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <button type="submit" class="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Update</button>
                            </form>
                            <form method="POST" onsubmit="return confirm('Remove this person from the school? Their login stays but loses all access here.')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="remove_staff">
                                <input type="hidden" name="user_school_id" value="<?= e($u['id']) ?>">
                                <input type="hidden" name="target_user_id" value="<?= e($u['user_id']) ?>">
                                <button type="submit" class="text-xs font-medium text-red-500 hover:text-red-700">Remove</button>
                            </form>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
            <?php if (empty($staffUsers)): ?>
                <p class="text-sm text-gray-400">No staff members found.</p>
            <?php endif; ?>
        </div>
    </div>

    <details class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <summary class="text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none">What each role can do</summary>
        <div class="mt-3 space-y-2 text-sm">
            <?php
            $roleGuide = [
                'school_admin' => 'Full access — everything in this school: students, fees, exams, reports, settings, and staff.',
                'head_teacher' => 'Academics & students — enrol/manage students, classes, admissions, exams, report cards, timetable, transport & activities. No finance or settings.',
                'teacher'      => 'Their own classes — grade entry, remarks, homework, lesson plans. Cannot manage school-wide students, fees, or setup.',
                'bursar'       => 'Finance — fees, invoices, payments, statements and finance reports. No academics or settings.',
                'group_admin'  => 'A consolidated view across all schools in the group (for multi-branch owners).',
            ];
            foreach ($roleGuide as $rk => $desc): if (!isset($staffRoleOptions[$rk])) continue; ?>
                <div class="flex gap-2">
                    <span class="inline-flex flex-shrink-0 items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 h-fit"><?= e(roleLabel($rk)) ?></span>
                    <span class="text-gray-500 text-xs leading-relaxed"><?= e($desc) ?></span>
                </div>
            <?php endforeach; ?>
            <p class="text-xs text-gray-400 pt-1">An Administrator can always do everything; other roles are additive on top of a normal staff login.</p>
        </div>
    </details>

    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Invite a Staff Member</h3>
        <form method="POST" class="flex flex-wrap gap-2 items-center">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="invite_staff">
            <input type="email" name="invite_email" required placeholder="Email address"
                class="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <select name="invite_role" class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <?php foreach ($staffRoleOptions as $rKey => $rLabel): ?>
                    <option value="<?= e($rKey) ?>"<?= $rKey === 'teacher' ? ' selected' : '' ?>><?= e($rLabel) ?></option>
                <?php endforeach; ?>
            </select>
            <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Create Invitation</button>
        </form>
        <p class="text-xs text-gray-400 mt-2">An invitation link appears below — copy it and send it to the person. They set their own password when they open it.</p>
    </div>

    <?php if (!empty($staffInvites)): ?>
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pending Invitations</h3>
        <div class="space-y-2">
            <?php foreach ($staffInvites as $inv): ?>
                <?php
                $expired    = strtotime($inv['expires_at'] ?? '') < time();
                $inviteLink = $appUrl . '/invite?token=' . urlencode($inv['token'] ?? '');
                ?>
                <div class="py-3 px-4 rounded-lg bg-gray-50">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <span class="text-sm font-medium text-gray-900"><?= e($inv['email']) ?></span>
                            <span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600"><?= e(roleLabel($inv['role'] ?? '')) ?></span>
                            <?php if ($expired): ?>
                                <span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600">Expired</span>
                            <?php endif; ?>
                        </div>
                        <div class="flex items-center gap-3">
                            <form method="POST">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="resend_invitation">
                                <input type="hidden" name="invitation_id" value="<?= e($inv['id']) ?>">
                                <button type="submit" class="text-xs font-medium text-emerald-600 hover:text-emerald-700">Resend</button>
                            </form>
                            <form method="POST" onsubmit="return confirm('Cancel this invitation?')">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="cancel_invitation">
                                <input type="hidden" name="invitation_id" value="<?= e($inv['id']) ?>">
                                <button type="submit" class="text-xs font-medium text-red-500 hover:text-red-700">Cancel</button>
                            </form>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                        <input type="text" readonly value="<?= e($inviteLink) ?>" onclick="this.select()"
                            class="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 bg-white font-mono">
                        <button type="button"
                            onclick="navigator.clipboard.writeText('<?= e($inviteLink) ?>'); this.textContent='Copied';"
                            class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition whitespace-nowrap">Copy link</button>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Teachers — class & subject assignments             -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'teachers' && $teachersTabData): ?>

<?php
$staffList       = $teachersTabData['staff'];
$assignsByUser   = $teachersTabData['assignsByUser'];
$classTeacherOf  = $teachersTabData['classTeacherOf'];
$classNameMapT   = $teachersTabData['classNameMap'];
$subjectNameMapT = $teachersTabData['subjectNameMap'];
$allClassesT     = $teachersTabData['allClasses'];
?>

<div class="space-y-4">
    <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-sm font-semibold text-gray-700 mb-1">Teachers</h2>
        <p class="text-xs text-gray-400 mb-4">Assign each teacher to the subjects they teach. Class-teacher assignments are managed from the <a href="<?= baseUrl('classes') ?>" class="text-emerald-600 hover:underline">Classes page</a>.</p>

        <?php if (empty($staffList)): ?>
            <p class="text-sm text-gray-400">No teaching staff yet. Invite one in Staff &amp; Roles, then come back.</p>
        <?php else: ?>
        <div class="space-y-2">
            <?php foreach ($staffList as $t): ?>
                <?php
                $uid          = $t['user_id'];
                $assignCount  = count($assignsByUser[$uid] ?? []);
                $ctList       = $classTeacherOf[$uid] ?? [];
                $ctNames      = array_column($ctList, 'name');
                ?>
                <div class="flex flex-wrap items-center justify-between gap-3 py-3 px-4 rounded-lg bg-gray-50">
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-gray-900">
                            <span class="teacher-name"><?= e($t['name']) ?></span>
                            <span class="text-[11px] text-gray-400 ml-1"><?= e(roleLabel($t['role'] ?? '')) ?></span>
                        </p>
                        <p class="text-xs text-gray-500 mt-0.5">
                            <?php if (!empty($ctNames)): ?>
                                Class teacher of <strong><?= e(implode(', ', $ctNames)) ?></strong> &middot;
                            <?php endif; ?>
                            <?= $assignCount ?> subject assignment<?= $assignCount === 1 ? '' : 's' ?>
                        </p>
                    </div>
                    <button type="button"
                            data-teacher-id="<?= e($uid) ?>"
                            data-teacher-name="<?= e($t['name']) ?>"
                            onclick="openTeacher('<?= e($uid) ?>', this.dataset.teacherName)"
                            class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                        Manage subjects
                    </button>
                </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>
</div>

<!-- Teacher modal -->
<div id="teacherModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-gray-900 mb-1"><span id="teacherTitle"></span></h3>
        <p class="text-xs text-gray-500 mb-4">Subjects this teacher teaches. One row per (class, subject).</p>

        <div id="teacherClassTeacherOf" class="mb-3 text-xs text-gray-600 hidden">
            <span class="font-semibold text-gray-700">Class teacher of:</span> <span id="teacherClassesList"></span>
        </div>

        <div id="teacherAssignmentsList" class="space-y-1.5 mb-4 border-y border-gray-100 py-3 min-h-[40px]">
            <!-- populated by JS -->
        </div>

        <form method="POST" class="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add_teacher_assignment">
            <input type="hidden" name="teacher_user_id" id="addTeacherUserId">
            <div>
                <label class="block text-[11px] font-medium text-gray-600 mb-1">Class</label>
                <select name="teacher_class_id" id="addClassSelect" onchange="onAddClassChange()" required class="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="">— Pick a class —</option>
                    <?php foreach ($allClassesT as $c): ?>
                        <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-[11px] font-medium text-gray-600 mb-1">Subject</label>
                <select name="teacher_subject_id" id="addSubjectSelect" required disabled class="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none disabled:bg-gray-50">
                    <option value="">— Pick a class first —</option>
                </select>
            </div>
            <button type="submit" class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add</button>
        </form>

        <div class="mt-5 flex justify-end">
            <button type="button" onclick="document.getElementById('teacherModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Close</button>
        </div>
    </div>
</div>

<script>
const teacherAssignments = <?= jsonHtml($assignsByUser, JSON_UNESCAPED_SLASHES) ?>;
const teacherClassesOf   = <?= jsonHtml(array_map(fn($cs) => array_column($cs, 'name'), $classTeacherOf), JSON_UNESCAPED_SLASHES) ?>;
const classSubjectsMapT  = <?= jsonHtml($teachersTabData['classSubjects'], JSON_UNESCAPED_SLASHES) ?>;
const classNameMapT      = <?= jsonHtml($classNameMapT, JSON_UNESCAPED_SLASHES) ?>;
const subjectNameMapT    = <?= jsonHtml($subjectNameMapT, JSON_UNESCAPED_SLASHES) ?>;
const csrfFieldTeachers  = document.querySelector('#teacherModal input[name=_token]').value;

function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function openTeacher(uid, name) {
    document.getElementById('teacherTitle').textContent = name;
    document.getElementById('addTeacherUserId').value = uid;

    const classes = teacherClassesOf[uid] || [];
    const ctRow   = document.getElementById('teacherClassTeacherOf');
    if (classes.length > 0) {
        document.getElementById('teacherClassesList').textContent = classes.join(', ');
        ctRow.classList.remove('hidden');
    } else {
        ctRow.classList.add('hidden');
    }

    const wrap    = document.getElementById('teacherAssignmentsList');
    const assigns = teacherAssignments[uid] || [];
    if (assigns.length === 0) {
        wrap.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">No subject assignments yet.</p>';
    } else {
        wrap.innerHTML = assigns.map(a => {
            const cn = classNameMapT[a.class_id] || 'Class';
            const sn = subjectNameMapT[a.subject_id] || 'Subject';
            return `
                <div class="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                    <span class="text-sm text-gray-800">${escHtml(cn)} <span class="text-gray-400">&middot;</span> ${escHtml(sn)}</span>
                    <form method="POST" onsubmit="return confirm('Remove this assignment?')" class="inline">
                        <input type="hidden" name="_token" value="${escHtml(csrfFieldTeachers)}">
                        <input type="hidden" name="action" value="remove_teacher_assignment">
                        <input type="hidden" name="assignment_id" value="${escHtml(a.id)}">
                        <input type="hidden" name="teacher_user_id" value="${escHtml(uid)}">
                        <button type="submit" class="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    </form>
                </div>`;
        }).join('');
    }

    document.getElementById('addClassSelect').value = '';
    document.getElementById('addSubjectSelect').innerHTML = '<option value="">— Pick a class first —</option>';
    document.getElementById('addSubjectSelect').disabled = true;

    document.getElementById('teacherModal').classList.remove('hidden');
}

function onAddClassChange() {
    const classId = document.getElementById('addClassSelect').value;
    const sel     = document.getElementById('addSubjectSelect');
    const subjIds = classSubjectsMapT[classId] || [];
    if (subjIds.length === 0) {
        sel.innerHTML = '<option value="">— No subjects on this class —</option>';
        sel.disabled = true;
        return;
    }
    sel.innerHTML = '<option value="">— Pick a subject —</option>' + subjIds.map(sid => {
        const name = subjectNameMapT[sid] || 'Subject';
        return `<option value="${escHtml(sid)}">${escHtml(name)}</option>`;
    }).join('');
    sel.disabled = false;
}

// Auto-open the modal if we just submitted (?teacher=<id> in URL).
(function () {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('teacher');
    if (!t) return;
    const btn = document.querySelector('button[data-teacher-id="' + t + '"]');
    if (btn) openTeacher(t, btn.dataset.teacherName);
})();
</script>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Currency & Invoice Settings                        -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'invoices'): ?>

<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <h2 class="text-sm font-semibold text-gray-700 mb-2">Currency & Invoice Preferences</h2>
    <p class="text-xs text-gray-400 mb-5">These settings control how fees are displayed and invoices are generated across the system.</p>

    <form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="update_invoice_settings">

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <!-- Currency -->
            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Currency</h3>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
                        <input type="text" name="currency_symbol" value="<?= e($settings['currency_symbol'] ?? 'KES') ?>" placeholder="KES"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                        <p class="text-xs text-gray-400 mt-1">Shown before amounts</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Code</label>
                        <select name="currency_code" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                            <?php
                            $currencies = ['KES' => 'KES — Kenyan Shilling', 'UGX' => 'UGX — Ugandan Shilling', 'TZS' => 'TZS — Tanzanian Shilling', 'NGN' => 'NGN — Nigerian Naira', 'GHS' => 'GHS — Ghanaian Cedi', 'ZAR' => 'ZAR — South African Rand', 'USD' => 'USD — US Dollar', 'GBP' => 'GBP — British Pound', 'EUR' => 'EUR — Euro'];
                            $currentCode = $settings['currency_code'] ?? 'KES';
                            foreach ($currencies as $code => $label):
                            ?>
                                <option value="<?= $code ?>"<?= $currentCode === $code ? ' selected' : '' ?>><?= $label ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Invoicing -->
            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Invoice Generation</h3>
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Invoice Prefix</label>
                        <input type="text" name="invoice_prefix" value="<?= e($settings['invoice_prefix'] ?? 'INV') ?>" placeholder="INV"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                        <p class="text-xs text-gray-400 mt-1">e.g. INV-A3F8B2C1</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Default Due Days</label>
                        <input type="number" name="default_due_days" value="<?= e($settings['default_due_days'] ?? '30') ?>" min="1" max="365"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                        <p class="text-xs text-gray-400 mt-1">Days after issue</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Boarding fee (per term)</label>
                        <input type="number" name="boarding_fee" value="<?= e($settings['boarding_fee'] ?? '0') ?>" min="0" step="100"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                        <p class="text-xs text-gray-400 mt-1">0 = no boarding. When set, a Boarding column appears on Generate Invoices, auto-ticked for boarders.</p>
                    </div>
                </div>
                <label class="flex items-center gap-2 cursor-pointer mt-2">
                    <input type="checkbox" name="auto_invoice_on_enroll" value="1"
                        <?= ($settings['auto_invoice_on_enroll'] ?? 'true') === 'true' ? 'checked' : '' ?>
                        class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Auto-generate invoice when student is enrolled</span>
                </label>
                <p class="text-xs text-gray-400 mt-1 ml-6">Automatically selects all mandatory fee heads when adding a new student.</p>

                <div class="mt-4 pt-3 border-t border-gray-200">
                    <label class="block text-sm font-medium text-gray-700 mb-1">KRA PIN</label>
                    <input type="text" name="kra_pin" value="<?= e($settings['kra_pin'] ?? '') ?>" placeholder="P051234567X"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none uppercase">
                    <p class="text-xs text-gray-400 mt-1">Shown on invoices, receipts &amp; the Accountant Pack. Leave blank if not registered.</p>
                </div>

                <div class="mt-4 pt-3 border-t border-gray-200">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Activities billing</label>
                    <?php $actMode = $settings['activities_billing_mode'] ?? 'bundled'; ?>
                    <select name="activities_billing_mode" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                        <option value="bundled"<?= $actMode === 'bundled' ? ' selected' : '' ?>>Bundle into the fee invoice</option>
                        <option value="separate"<?= $actMode === 'separate' ? ' selected' : '' ?>>Bill on a separate invoice</option>
                    </select>
                    <p class="text-xs text-gray-400 mt-1">"Separate" puts selected activities on their own invoice (prefix <span class="font-mono">ACT-</span>) so parents can pay them independently of fees.</p>
                </div>

                <label class="flex items-start gap-2 cursor-pointer mt-4 pt-3 border-t border-gray-200">
                    <input type="checkbox" name="require_approval_cancel" value="1"
                        <?= ($settings['require_approval_cancel'] ?? 'false') === 'true' ? 'checked' : '' ?>
                        class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Require approval to cancel an invoice
                        <span class="block text-xs text-gray-400 font-normal">Bursar / front office requests wait for a school admin. School admins cancel immediately (so a one-admin school is never stuck).</span>
                    </span>
                </label>

                <label class="flex items-start gap-2 cursor-pointer mt-3">
                    <input type="checkbox" name="require_approval_discount" value="1"
                        <?= ($settings['require_approval_discount'] ?? 'false') === 'true' ? 'checked' : '' ?>
                        class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Require approval to assign a discount
                        <span class="block text-xs text-gray-400 font-normal">Non-admins wait for a school admin. Admins apply discounts immediately.</span>
                    </span>
                </label>

                <label class="flex items-start gap-2 cursor-pointer mt-3">
                    <input type="checkbox" name="require_approval_void_payment" value="1"
                        <?= ($settings['require_approval_void_payment'] ?? 'true') === 'true' ? 'checked' : '' ?>
                        class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Require approval to void a payment
                        <span class="block text-xs text-gray-400 font-normal">Non-admins wait for a school admin. School admins void immediately — required for single-admin schools.</span>
                    </span>
                </label>

                <label class="flex items-start gap-2 cursor-pointer mt-3">
                    <input type="checkbox" name="require_approval_void_expense" value="1"
                        <?= ($settings['require_approval_void_expense'] ?? 'true') === 'true' ? 'checked' : '' ?>
                        class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Require approval to void an expense
                        <span class="block text-xs text-gray-400 font-normal">Same rule as payments: non-admins wait for a school admin, admins void immediately. A reason is always recorded.</span>
                    </span>
                </label>

                <label class="flex items-start gap-2 cursor-pointer mt-3">
                    <input type="checkbox" name="require_approval_credit_note" value="1"
                        <?= ($settings['require_approval_credit_note'] ?? 'false') === 'true' ? 'checked' : '' ?>
                        class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Require approval to apply or reverse a credit note
                        <span class="block text-xs text-gray-400 font-normal">Non-admins wait for a school admin. Admins act immediately. Use credit notes for bill changes — not to undo a payment.</span>
                    </span>
                </label>

                <label class="flex items-start gap-2 cursor-pointer mt-3">
                    <input type="checkbox" name="payment_void_same_day_only" value="1"
                        <?= ($settings['payment_void_same_day_only'] ?? 'false') === 'true' ? 'checked' : '' ?>
                        class="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Only allow payment void on the same day
                        <span class="block text-xs text-gray-400 font-normal">Leave off so staff can void a mistaken collection from last week. The invoice total stays the same; only amount paid is reversed.</span>
                    </span>
                </label>
            </div>
        </div>

        <!-- Brand & Printed Invoice -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Invoice Brand Color</h3>
                <p class="text-xs text-gray-400 mb-3">Used for the header bar and accents on printed invoices &amp; receipts. Pick the color from your school logo.</p>
                <div class="flex items-center gap-3">
                    <input type="color"
                           name="brand_color"
                           value="<?= e($settings['brand_color'] ?? '#059669') ?>"
                           id="brandColorInput"
                           class="w-14 h-10 rounded-lg border border-gray-200 cursor-pointer p-1 bg-white">
                    <input type="text"
                           id="brandColorHex"
                           value="<?= e($settings['brand_color'] ?? '#059669') ?>"
                           maxlength="7"
                           class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:border-emerald-400 outline-none"
                           placeholder="#059669">
                </div>
                <p class="text-xs text-gray-400 mt-2">Tip: open your logo image, sample a color, paste the HEX here.</p>
            </div>

            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Print Paper Size</h3>
                <p class="text-xs text-gray-400 mb-3">The paper your printer is loaded with. Applies to printed invoices, bulk invoices, and receipts. Choose A5 if you print on half-size sheets or a receipt book.</p>
                <?php $paperSel = ($settings['print_paper_size'] ?? 'A4') === 'A5' ? 'A5' : 'A4'; ?>
                <select name="print_paper_size" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="A4"<?= $paperSel === 'A4' ? ' selected' : '' ?>>A4 (full page)</option>
                    <option value="A5"<?= $paperSel === 'A5' ? ' selected' : '' ?>>A5 (half page / receipt book)</option>
                </select>
                <p class="text-xs text-gray-400 mt-2">Tip: in the browser print dialog, also turn off "Headers and footers" so the date/URL line doesn't print.</p>
            </div>

            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fields Shown on Invoices</h3>
                <p class="text-xs text-gray-400 mb-3">Untick anything your school doesn't want printed on fee invoices.</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <?php
                    $invFieldOpts = [
                        'inv_show_roll'     => 'Roll number',
                        'inv_show_due_date' => 'Due date',
                        'inv_show_section'  => 'Section / stream',
                        'inv_show_guardian' => 'Guardian name',
                        'inv_show_phone'    => 'Guardian phone',
                        'inv_show_payments' => 'Payment history',
                        'inv_show_disclaimer' => 'No-signature line',
                    ];
                    foreach ($invFieldOpts as $fk => $fl): ?>
                        <label class="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" name="<?= e($fk) ?>" value="1"
                                   <?= (($settings[$fk] ?? '1') === '1') ? 'checked' : '' ?>
                                   class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-gray-700"><?= e($fl) ?></span>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notes on Every Invoice</h3>
                <p class="text-xs text-gray-400 mb-3">Printed at the bottom of every invoice &amp; bulk-print page. Use this for payment instructions, bank details, deadlines, etc.
                    Wrap text in double asterisks to make it <strong>bold</strong> on the invoice — e.g. <code class="bg-gray-100 px-1 rounded">**Paybill 400222, Account: admission number**</code>.</p>
                <textarea name="invoice_notes"
                          id="invoiceNotesInput"
                          rows="4"
                          maxlength="1000"
                          class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none resize-y"
                          placeholder="e.g. Fees are due by the 1st of every month. Pay to **Paybill 400222 — Account: your child's admission number**, or Equity Bank A/C 0123456789."><?= e($settings['invoice_notes'] ?? '') ?></textarea>
                <p class="text-xs text-gray-400 mt-1"><span id="notesCount"><?= strlen($settings['invoice_notes'] ?? '') ?></span>/1000 characters</p>
            </div>

            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Note on Every Receipt</h3>
                <p class="text-xs text-gray-400 mb-3">One short line printed at the bottom of every payment receipt (shown as <strong>NB: …</strong>). Leave blank for none.</p>
                <input type="text" name="receipt_note" maxlength="200"
                       value="<?= e($settings['receipt_note'] ?? '') ?>"
                       class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none"
                       placeholder="e.g. Kindly note that fees once paid are non-refundable.">
            </div>
        </div>

        <!-- Preview -->
        <div class="p-4 rounded-xl border mb-5"
             id="invoicePreviewCard"
             style="background-color: <?= e($settings['brand_color'] ?? '#059669') ?>15; border-color: <?= e($settings['brand_color'] ?? '#059669') ?>40;">
            <h3 class="text-xs font-semibold uppercase tracking-wider mb-2" id="invoicePreviewTitle" style="color: <?= e($settings['brand_color'] ?? '#059669') ?>;">Preview</h3>
            <p class="text-sm text-gray-700">Fee amounts will display as: <strong id="currencyPreview"><?= e($settings['currency_symbol'] ?? 'KES') ?> 15,000.00</strong></p>
            <p class="text-sm text-gray-700 mt-1">Invoices will be numbered: <strong id="prefixPreview"><?= e($settings['invoice_prefix'] ?? 'INV') ?>-A3F8B2C1</strong></p>
            <div class="mt-3 rounded-lg overflow-hidden border border-gray-200 bg-white">
                <div id="brandBarPreview" class="px-3 py-2 text-white text-xs font-bold uppercase tracking-wider"
                     style="background-color: <?= e($settings['brand_color'] ?? '#059669') ?>;">FEE INVOICE — header preview</div>
                <?php $_existingNotes = trim($settings['invoice_notes'] ?? ''); ?>
                <div class="px-3 py-2 text-xs text-gray-500 whitespace-pre-line <?= $_existingNotes === '' ? 'italic' : '' ?>" id="notesPreview"><?= $_existingNotes !== '' ? e($_existingNotes) : 'Notes you add above will appear here on every printed invoice.' ?></div>
            </div>
        </div>

        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save Settings</button>
    </form>
</div>

<script>
// Live preview
document.querySelector('[name=currency_symbol]').addEventListener('input', function() {
    document.getElementById('currencyPreview').textContent = this.value + ' 15,000.00';
});
document.querySelector('[name=invoice_prefix]').addEventListener('input', function() {
    document.getElementById('prefixPreview').textContent = this.value + '-A3F8B2C1';
});

// Brand color: keep the color picker and hex input in sync, update preview live
(function(){
    const picker  = document.getElementById('brandColorInput');
    const hex     = document.getElementById('brandColorHex');
    const title   = document.getElementById('invoicePreviewTitle');
    const bar     = document.getElementById('brandBarPreview');
    const card    = document.getElementById('invoicePreviewCard');
    const isHex   = v => /^#[0-9A-Fa-f]{6}$/.test(v);

    function apply(color) {
        if (!isHex(color)) return;
        title.style.color = color;
        bar.style.backgroundColor = color;
        card.style.backgroundColor = color + '15';
        card.style.borderColor = color + '40';
    }
    picker.addEventListener('input', e => { hex.value = e.target.value; apply(e.target.value); });
    hex.addEventListener('input', e => {
        const v = e.target.value.trim();
        if (isHex(v)) { picker.value = v; apply(v); }
    });
})();

// Invoice notes: live char count + preview
(function(){
    const ta     = document.getElementById('invoiceNotesInput');
    const count  = document.getElementById('notesCount');
    const prev   = document.getElementById('notesPreview');
    const empty  = 'Notes you add above will appear here on every printed invoice.';
    ta.addEventListener('input', e => {
        count.textContent = e.target.value.length;
        prev.textContent = e.target.value.trim() ? e.target.value : empty;
        prev.classList.toggle('italic', !e.target.value.trim());
    });
})();
</script>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: Payment Methods                                    -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'methods'): ?>

<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <h2 class="text-sm font-semibold text-gray-700 mb-2">Payment Methods</h2>
    <p class="text-xs text-gray-400 mb-4">Configure which payment methods appear in payment forms across the system. These are available school-wide.</p>

    <!-- Existing Methods -->
    <div class="space-y-2 mb-5">
        <?php foreach ($allMethods as $m): ?>
            <div class="flex items-center justify-between py-3 px-4 rounded-lg <?= $m['is_active'] ? 'bg-gray-50' : 'bg-gray-50/50 opacity-60' ?>">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                        <?php
                        $colors = ['cash' => 'bg-green-100 text-green-700', 'mpesa' => 'bg-emerald-100 text-emerald-700', 'bank_transfer' => 'bg-blue-100 text-blue-700', 'cheque' => 'bg-purple-100 text-purple-700'];
                        echo $colors[$m['code']] ?? 'bg-gray-100 text-gray-600';
                        ?>">
                        <?= strtoupper(substr($m['name'], 0, 1)) ?>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-gray-900"><?= e($m['name']) ?></span>
                        <span class="ml-2 text-xs text-gray-400 font-mono"><?= e($m['code']) ?></span>
                        <?php if (!$m['is_active']): ?>
                            <span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-500">Disabled</span>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <form method="POST" class="inline">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="toggle_payment_method">
                        <input type="hidden" name="method_id" value="<?= e($m['id']) ?>">
                        <input type="hidden" name="new_status" value="<?= $m['is_active'] ? 'false' : 'true' ?>">
                        <button type="submit" class="text-xs font-medium <?= $m['is_active'] ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800' ?>">
                            <?= $m['is_active'] ? 'Disable' : 'Enable' ?>
                        </button>
                    </form>
                    <form method="POST" class="inline" onsubmit="return confirm('Delete this payment method? Existing payment records using it will keep their method value.')">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="delete_payment_method">
                        <input type="hidden" name="method_id" value="<?= e($m['id']) ?>">
                        <button type="submit" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                    </form>
                </div>
            </div>
        <?php endforeach; ?>
        <?php if (empty($allMethods)): ?>
            <div class="text-center py-8">
                <p class="text-gray-400 text-sm">No payment methods configured.</p>
                <p class="text-gray-400 text-xs mt-1">Add at least one payment method below.</p>
            </div>
        <?php endif; ?>
    </div>

    <!-- Add New Method -->
    <form method="POST" class="border-t border-gray-100 pt-4">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="add_payment_method">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Add Payment Method</h3>
        <div class="flex gap-2">
            <input type="text" name="method_name" required placeholder="Method name (e.g. Mobile Money)"
                class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <input type="text" name="method_code" placeholder="Code (auto-generated)"
                class="w-36 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Add</button>
        </div>
        <p class="text-xs text-gray-400 mt-1">Code is auto-generated from the name if left blank. It must be unique.</p>
    </form>
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- TAB: M-Pesa Integration                                 -->
<!-- ═══════════════════════════════════════════════════════ -->
<?php elseif ($activeTab === 'mpesa'): ?>

<?php
$mpesaConfigured = !empty($settings['mpesa_consumer_key']) && !empty($settings['mpesa_consumer_secret']) && !empty($settings['mpesa_shortcode']);
?>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

    <!-- How it works -->
    <div class="lg:col-span-1">
        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 class="text-sm font-semibold text-gray-700 mb-3">How M-Pesa Works</h2>
            <div class="space-y-3 text-sm text-gray-600">
                <div class="flex gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">1</span>
                    <span>Admin records payment and clicks "Send M-Pesa Prompt"</span>
                </div>
                <div class="flex gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">2</span>
                    <span>Parent receives "Enter M-Pesa PIN" prompt on their phone</span>
                </div>
                <div class="flex gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">3</span>
                    <span>Parent enters PIN to confirm payment</span>
                </div>
                <div class="flex gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">4</span>
                    <span>Payment auto-records against the student's invoice</span>
                </div>
            </div>

            <div class="mt-5 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p class="text-xs text-blue-800 font-semibold mb-1">Requirements</p>
                <ul class="text-xs text-blue-700 space-y-1">
                    <li>Safaricom Paybill or Till Number</li>
                    <li>Daraja developer account (daraja.safaricom.co.ke)</li>
                    <li>Consumer Key & Secret from your Daraja app</li>
                    <li>Lipa Na M-Pesa Online Passkey</li>
                </ul>
            </div>

            <div class="mt-4">
                <div class="flex items-center gap-2">
                    <div class="w-2.5 h-2.5 rounded-full <?= $mpesaConfigured ? 'bg-emerald-500' : 'bg-gray-300' ?>"></div>
                    <span class="text-sm font-medium <?= $mpesaConfigured ? 'text-emerald-700' : 'text-gray-500' ?>">
                        <?= $mpesaConfigured ? 'Configured' : 'Not configured' ?>
                    </span>
                </div>
            </div>
        </div>
    </div>

    <!-- Credentials -->
    <div class="lg:col-span-2">
        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">Daraja API Credentials</h2>

            <form method="POST">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="update_mpesa">

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Environment</label>
                        <select name="mpesa_environment" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                            <option value="sandbox"<?= ($settings['mpesa_environment'] ?? 'sandbox') === 'sandbox' ? ' selected' : '' ?>>Sandbox (Testing)</option>
                            <option value="production"<?= ($settings['mpesa_environment'] ?? '') === 'production' ? ' selected' : '' ?>>Production (Live)</option>
                        </select>
                        <p class="text-xs text-gray-400 mt-1">Start with Sandbox to test, switch to Production when ready.</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Business Shortcode (Paybill/Till)</label>
                        <input type="text" name="mpesa_shortcode" value="<?= e($settings['mpesa_shortcode'] ?? '') ?>" placeholder="e.g. 174379"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Consumer Key</label>
                        <input type="text" name="mpesa_consumer_key" value="<?= e($settings['mpesa_consumer_key'] ?? '') ?>" placeholder="From your Daraja app"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none font-mono text-xs">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Consumer Secret</label>
                        <input type="password" name="mpesa_consumer_secret" value="<?= e($settings['mpesa_consumer_secret'] ?? '') ?>" placeholder="From your Daraja app"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none font-mono text-xs">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Lipa Na M-Pesa Passkey</label>
                        <input type="password" name="mpesa_passkey" value="<?= e($settings['mpesa_passkey'] ?? '') ?>" placeholder="Provided by Safaricom"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none font-mono text-xs">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Callback URL</label>
                        <input type="url" name="mpesa_callback_url" value="<?= e($settings['mpesa_callback_url'] ?? '') ?>"
                            placeholder="<?= e(APP_URL) ?>/?route=api/mpesa/callback"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none text-xs">
                        <p class="text-xs text-gray-400 mt-1">Safaricom sends payment confirmations here. Must be publicly accessible HTTPS URL.</p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save Credentials</button>
                    <button type="submit" name="action" value="test_mpesa" class="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                        Test Connection
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- ── C2B Auto-Payment Registration ─────────────────────── -->
<?php
$c2bRegistered = ($settings['mpesa_c2b_registered'] ?? '') === 'true';
?>
<div class="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

    <!-- C2B Explanation -->
    <div class="lg:col-span-1">
        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 class="text-sm font-semibold text-gray-700 mb-3">Auto-Payment (C2B)</h2>
            <p class="text-sm text-gray-600 mb-3">When a parent pays directly to your Paybill/Till number from their phone, the system automatically matches it to the right invoice.</p>
            <div class="space-y-3 text-sm text-gray-600">
                <div class="flex gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">1</span>
                    <span>Parent goes to M-Pesa → Lipa Na M-Pesa → Pay Bill</span>
                </div>
                <div class="flex gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">2</span>
                    <span>Enters your Paybill number and their child's <strong>admission number</strong> as the account number (an invoice number also works)</span>
                </div>
                <div class="flex gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">3</span>
                    <span>System auto-matches and records the payment instantly</span>
                </div>
            </div>

            <div class="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p class="text-xs text-amber-800 font-semibold mb-1">Matching Priority</p>
                <p class="text-xs text-amber-700">The system tries to match by: invoice reference first, then admission number, then guardian phone number. Unmatched payments are logged for manual review.</p>
            </div>

            <div class="mt-4">
                <div class="flex items-center gap-2">
                    <div class="w-2.5 h-2.5 rounded-full <?= $c2bRegistered ? 'bg-emerald-500' : 'bg-gray-300' ?>"></div>
                    <span class="text-sm font-medium <?= $c2bRegistered ? 'text-emerald-700' : 'text-gray-500' ?>">
                        <?= $c2bRegistered ? 'C2B Active' : 'C2B Not registered' ?>
                    </span>
                </div>
            </div>
        </div>
    </div>

    <!-- C2B Registration + Unmatched Payments -->
    <div class="lg:col-span-2 space-y-6">

        <!-- Register C2B -->
        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 class="text-sm font-semibold text-gray-700 mb-2">Register C2B URLs</h2>
            <p class="text-xs text-gray-400 mb-4">This tells Safaricom where to send payment notifications. You only need to do this once<?= $c2bRegistered ? ' (already registered)' : '' ?>.</p>
            <form method="POST">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="register_c2b">
                <div class="mb-3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Your App Base URL</label>
                    <input type="url" name="app_base_url" value="<?= e(APP_URL) ?>" placeholder="<?= e(APP_URL) ?>"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <p class="text-xs text-gray-400 mt-1">The system will register: <code class="text-gray-500">{base_url}/?route=api/mpesa/c2b-validation</code> and <code class="text-gray-500">{base_url}/?route=api/mpesa/c2b-confirmation</code></p>
                </div>
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition" <?= !$mpesaConfigured ? 'disabled title="Save M-Pesa credentials first"' : '' ?>>
                    <?= $c2bRegistered ? 'Re-register C2B URLs' : 'Register C2B with Safaricom' ?>
                </button>
            </form>
        </div>

        <!-- Unmatched Payments -->
        <?php
        $unmatchedResult = $sb->from('mpesa_c2b_payments')->select('id,trans_id,phone,amount,bill_ref,payer_name,match_notes,created_at')
            ->eq('school_id', $sid)->eq('status', 'unmatched')
            ->order('created_at', false)->limit(10)->execute();
        $unmatched = $unmatchedResult['data'] ?? [];
        ?>
        <?php if (!empty($unmatched)): ?>
        <div class="bg-white rounded-xl border border-gray-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div class="flex items-center justify-between mb-3">
                <h2 class="text-sm font-semibold text-gray-700">Unmatched M-Pesa Payments</h2>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><?= count($unmatched) ?> pending</span>
            </div>
            <p class="text-xs text-gray-400 mb-3">These payments came in but couldn't be matched to an invoice. The parent may have entered the wrong account reference.</p>
            <div class="space-y-2">
                <?php foreach ($unmatched as $up): ?>
                <div class="flex items-center justify-between py-2.5 px-3 rounded-lg bg-amber-50/50 border border-amber-100">
                    <div>
                        <span class="text-sm font-medium text-gray-900"><?= e($up['payer_name'] ?: 'Unknown') ?></span>
                        <span class="text-xs text-gray-500 ml-2"><?= e($up['phone'] ?? '') ?></span>
                        <p class="text-xs text-gray-400 mt-0.5">
                            Ref: <strong><?= e($up['bill_ref'] ?: '—') ?></strong>
                            &middot; <?= e($up['trans_id'] ?? '') ?>
                            &middot; <?= formatDate($up['created_at'] ?? '') ?>
                        </p>
                    </div>
                    <span class="text-sm font-bold text-gray-900"><?= money((float)($up['amount'] ?? 0)) ?></span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>
</div>

<?php elseif ($activeTab === 'sms'): ?>
<div class="max-w-2xl">
    <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-lg font-semibold text-gray-900 mb-1">Bulk SMS</h2>
        <p class="text-sm text-gray-500 mb-5">Send fee reminders and alerts to guardians. Add a provider below, then use <a href="<?= baseUrl('communications/sms') ?>" class="text-emerald-600 hover:underline">Send SMS</a>.</p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="update_sms">

            <label class="flex items-center gap-2.5 mb-5 cursor-pointer">
                <input type="checkbox" name="sms_enabled" value="1" <?= ($settings['sms_enabled'] ?? '0') === '1' ? 'checked' : '' ?> class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                <span class="text-sm font-medium text-gray-800">Enable SMS sending</span>
            </label>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select name="sms_provider" id="smsProvider" onchange="smsToggle()" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <option value="textsms" <?= ($settings['sms_provider'] ?? 'textsms') === 'textsms' ? 'selected' : '' ?>>TextSMS Kenya (recommended)</option>
                    <option value="africastalking" <?= ($settings['sms_provider'] ?? '') === 'africastalking' ? 'selected' : '' ?>>Africa's Talking</option>
                    <option value="generic" <?= ($settings['sms_provider'] ?? '') === 'generic' ? 'selected' : '' ?>>Generic / other aggregator</option>
                </select>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">API key</label>
                <input type="text" name="sms_api_key" value="<?= e($settings['sms_api_key'] ?? '') ?>" placeholder="Provider API key" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Sender ID <span id="smsSenderReq" class="text-gray-400">(optional)</span></label>
                <input type="text" name="sms_sender_id" value="<?= e($settings['sms_sender_id'] ?? '') ?>" placeholder="e.g. school short name" maxlength="11" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-[11px] text-gray-400 mt-1">The branded name recipients see. Must be pre-approved by the provider.</p>
            </div>

            <div id="smsTextsms" class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Partner ID</label>
                <input type="text" name="sms_partner_id" value="<?= e($settings['sms_partner_id'] ?? '') ?>" placeholder="e.g. 1234" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                <p class="text-[11px] text-gray-400 mt-1">From your TextSMS account, alongside the API key. Sender ID is required for this provider.</p>
            </div>

            <div id="smsAt" class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Africa's Talking username</label>
                <input type="text" name="sms_username" value="<?= e($settings['sms_username'] ?? '') ?>" placeholder="your AT username (use 'sandbox' to test)" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <div id="smsGeneric" class="hidden">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Send URL template</label>
                    <input type="text" name="sms_generic_url" value="<?= e($settings['sms_generic_url'] ?? '') ?>" placeholder="https://api.provider.com/send?apikey={apikey}&to={to}&from={sender}&msg={message}" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                    <p class="text-[11px] text-gray-400 mt-1">Use placeholders <code>{to}</code> <code>{message}</code> <code>{apikey}</code> <code>{sender}</code>. One request per recipient.</p>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Method</label>
                    <select name="sms_generic_method" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="GET" <?= ($settings['sms_generic_method'] ?? 'GET') === 'GET' ? 'selected' : '' ?>>GET</option>
                        <option value="POST" <?= ($settings['sms_generic_method'] ?? '') === 'POST' ? 'selected' : '' ?>>POST</option>
                    </select>
                </div>
            </div>

            <button type="submit" class="mt-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save SMS settings</button>
        </form>

        <!-- Test send: prove the credentials work before using it for real. -->
        <div class="mt-6 pt-5 border-t border-gray-100">
            <h3 class="text-sm font-semibold text-gray-700 mb-1">Send a test message</h3>
            <p class="text-xs text-gray-500 mb-3">Save your settings first, then send one SMS to your own phone to confirm the provider accepts them.</p>
            <form method="POST" class="flex gap-2 flex-wrap items-start">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="test_sms">
                <input type="text" name="test_phone" required placeholder="07XX XXX XXX" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm w-48">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Send test SMS</button>
            </form>
        </div>
    </div>
    <p class="text-xs text-gray-400 mt-3">Tip: sign up with an aggregator (Africa's Talking is reliable; MobileSasa / UjumbeSMS are cheaper), get an API key + Sender ID, paste them here. Test with a small group first.</p>
</div>
<script>
function smsToggle() {
    var p = document.getElementById('smsProvider').value;
    document.getElementById('smsTextsms').classList.toggle('hidden', p !== 'textsms');
    document.getElementById('smsAt').classList.toggle('hidden', p !== 'africastalking');
    document.getElementById('smsGeneric').classList.toggle('hidden', p !== 'generic');
    document.getElementById('smsSenderReq').textContent = (p === 'textsms') ? '(required)' : '(optional)';
}
smsToggle();
</script>

<?php elseif ($activeTab === 'whatsapp'): ?>
<div class="max-w-2xl">
    <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 class="text-lg font-bold text-gray-900 mb-1">WhatsApp</h2>
        <p class="text-sm text-gray-500 mb-5">Send report cards and notices straight to parents' WhatsApp, using your own Meta WhatsApp Business account.</p>

        <?php $waOn = ($settings['wa_enabled'] ?? '0') === '1'; ?>
        <?php if (!$waOn): ?>
        <div class="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p class="text-sm font-medium text-blue-900 mb-1">Before you can send</p>
            <ol class="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                <li>Create a <strong>Meta Business</strong> account and add the <strong>WhatsApp</strong> product at developers.facebook.com.</li>
                <li>Add the school's phone number and verify it (it must not be on the normal WhatsApp app).</li>
                <li>Create a <strong>permanent access token</strong> via a System User (temporary tokens expire in 24 hours).</li>
                <li>Submit a <strong>message template</strong> for approval — business-initiated messages must use one.</li>
            </ol>
            <p class="text-[11px] text-blue-700 mt-2">Meta charges per message by category; utility messages (fee notices, report cards) are the cheapest tier.</p>
        </div>
        <?php endif; ?>

        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="update_whatsapp">

            <label class="flex items-center gap-2.5 mb-5 cursor-pointer">
                <input type="checkbox" name="wa_enabled" value="1" <?= $waOn ? 'checked' : '' ?> class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                <span class="text-sm font-medium text-gray-800">Enable WhatsApp sending</span>
            </label>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Permanent access token</label>
                <div class="flex gap-2">
                    <input type="password" name="wa_token" id="waTokenField" value="<?= e($settings['wa_token'] ?? '') ?>" placeholder="EAAG…" autocomplete="off" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                    <button type="button" onclick="var f=document.getElementById('waTokenField');f.type=f.type==='password'?'text':'password';this.textContent=f.type==='password'?'Show':'Hide';" class="px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex-none">Show</button>
                </div>
                <p class="text-[11px] text-gray-400 mt-1">From a Meta System User — not the 24-hour temporary token. Kept hidden: anyone with this string can send as the school.</p>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
                <input type="text" name="wa_phone_id" value="<?= e($settings['wa_phone_id'] ?? '') ?>" placeholder="e.g. 123456789012345" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                <p class="text-[11px] text-gray-400 mt-1">The numeric <em>ID</em> shown in Meta's WhatsApp setup — not the phone number itself.</p>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">WhatsApp Business Account ID <span class="text-gray-400">(WABA)</span></label>
                <input type="text" name="wa_waba_id" value="<?= e($settings['wa_waba_id'] ?? '') ?>" placeholder="e.g. 323913511293947" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                <p class="text-[11px] text-gray-400 mt-1">Not needed to send. With it, Tuta can list the templates approved on the account below, so you pick a real one instead of guessing.</p>
            </div>

            <?php if (trim((string)($settings['wa_waba_id'] ?? '')) !== '' && trim((string)($settings['wa_token'] ?? '')) !== ''):
                $tplList = whatsappListTemplates(); ?>
            <div class="mb-4 rounded-lg border border-gray-200 overflow-hidden">
                <div class="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                    <span>Templates on this account</span>
                    <?php if ($tplList['ok']): ?><span class="normal-case font-normal"><?= count($tplList['templates']) ?> found · click one to use it</span><?php endif; ?>
                </div>
                <?php if (!$tplList['ok']): ?>
                    <p class="px-3 py-2.5 text-xs text-red-700">Could not read templates: <?= e($tplList['error']) ?></p>
                <?php elseif (!$tplList['templates']): ?>
                    <p class="px-3 py-2.5 text-xs text-gray-500">No templates on this account yet. Create one in WhatsApp Manager (or ask wa-crm to), wait for approval, then refresh.</p>
                <?php else: ?>
                <div class="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                    <?php foreach ($tplList['templates'] as $t): $approved = $t['status'] === 'APPROVED'; ?>
                    <button type="button" <?= $approved ? 'onclick="document.querySelector(\'[name=wa_template]\').value=' . jsonHtml($t['name']) . ';document.querySelector(\'[name=wa_lang]\').value=' . jsonHtml($t['language']) . ';"' : 'disabled' ?>
                            class="w-full text-left px-3 py-2 text-xs flex items-center gap-3 <?= $approved ? 'hover:bg-emerald-50/60 cursor-pointer' : 'opacity-60 cursor-not-allowed' ?>">
                        <span class="font-mono text-gray-900 min-w-0 truncate"><?= e($t['name']) ?></span>
                        <span class="font-mono text-gray-500 flex-none"><?= e($t['language']) ?></span>
                        <span class="text-gray-400 flex-none"><?= (int)$t['variables'] ?> slot<?= (int)$t['variables'] === 1 ? '' : 's' ?></span>
                        <span class="ml-auto inline-flex px-1.5 py-0.5 rounded font-semibold flex-none <?= $approved ? 'bg-emerald-50 text-emerald-700' : ($t['status'] === 'PENDING' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700') ?>"><?= e(ucfirst(strtolower($t['status']))) ?></span>
                    </button>
                    <?php if ($t['status'] === 'REJECTED' && $t['reason'] !== '' && $t['reason'] !== 'NONE'):
                        $why = ['INVALID_FORMAT' => 'invalid format — usually variables submitted without example values',
                                'INCORRECT_CATEGORY' => 'category does not match the content (e.g. marketing wording sent as utility)',
                                'ABUSIVE_CONTENT' => 'content flagged by Meta', 'SCAM' => 'content flagged as a scam',
                                'TAG_CONTENT_MISMATCH' => 'category does not match the content'][$t['reason']] ?? strtolower(str_replace('_', ' ', $t['reason'])); ?>
                    <p class="px-3 pb-2 -mt-1 text-[11px] text-red-600">Meta's reason: <?= e($why) ?>. Submit Tuta's version below instead — it goes in with examples, as Utility, in en_US.</p>
                    <?php endif; ?>
                    <?php if (!$approved): ?>
                    <p class="px-3 pb-2 -mt-1">
                        <!-- The real form lives outside the settings form (forms can't nest); this button points at it. -->
                        <button type="submit" form="delTpl_<?= md5($t['name']) ?>" onclick="return confirm('Remove template <?= e(addslashes($t['name'])) ?> (all languages) from the WhatsApp account?')" class="text-[11px] text-gray-500 hover:text-red-600 underline">Remove this template</button>
                    </p>
                    <?php endif; ?>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
            <?php endif; ?>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div class="sm:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Approved template name</label>
                    <input type="text" name="wa_template" value="<?= e($settings['wa_template'] ?? '') ?>" placeholder="e.g. fee_notice" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Language</label>
                    <input type="text" name="wa_lang" value="<?= e($settings['wa_lang'] ?? 'en') ?>" placeholder="en" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                    <p class="text-[11px] text-gray-400 mt-1">e.g. en, en_US</p>
                </div>
            </div>

            <div class="rounded-lg border border-gray-100 bg-gray-50/60 p-4 mb-4">
                <p class="text-sm font-semibold text-gray-800 mb-1">Fee reminders</p>
                <p class="text-xs text-gray-500 mb-3">Meta only lets a school start a conversation with an approved template, so a reminder is sent by filling the template's <span class="font-mono">{{1}}</span>, <span class="font-mono">{{2}}</span>… slots. Say which template, and which values go in which slot.</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Reminder template <span class="text-gray-400">(blank = the template above)</span></label>
                        <input type="text" name="wa_reminder_template" value="<?= e($settings['wa_reminder_template'] ?? '') ?>" placeholder="e.g. fee_reminder" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Slot values, in order</label>
                        <input type="text" name="wa_reminder_params" value="<?= e($settings['wa_reminder_params'] ?? 'message') ?>" placeholder="message" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                    </div>
                </div>
                <p class="text-[11px] text-gray-500 mt-2">Comma-separated from: <span class="font-mono">message</span> (the whole approved text), <span class="font-mono">guardian</span>, <span class="font-mono">student</span>, <span class="font-mono">balance</span>, <span class="font-mono">invoice</span>, <span class="font-mono">days</span>, <span class="font-mono">school</span>. Simplest template: one slot, value <span class="font-mono">message</span>. A richer one, e.g. "Dear {{1}}, {{2}}'s balance at {{4}} is {{3}}" → <span class="font-mono">guardian, student, balance, school</span>.</p>
            </div>

            <?php $webhookUrl = rtrim((string)(defined('APP_URL') ? APP_URL : baseUrl('')), '/') . '/index.php?route=api/whatsapp/webhook';
                  $verifyTok = (string)($settings['wa_verify_token'] ?? ''); ?>
            <div class="rounded-lg border border-gray-100 bg-gray-50/60 p-4 mb-4">
                <p class="text-sm font-semibold text-gray-800 mb-1">Parent assistant <span class="text-gray-400 font-normal">(two-way)</span></p>
                <p class="text-xs text-gray-500 mb-3">Parents message this number, see each child's balance, and pay by M-Pesa from the chat. Meta needs to know where to deliver their messages — paste these two into your Meta app under <span class="font-medium">WhatsApp → Configuration → Webhook</span>, then subscribe to the <span class="font-mono">messages</span> field.</p>
                <label class="flex items-center gap-2.5 mb-3 cursor-pointer">
                    <input type="checkbox" name="wa_bot_enabled" value="1" <?= ($settings['wa_bot_enabled'] ?? '1') === '1' ? 'checked' : '' ?> class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-800">Reply to parents automatically</span>
                </label>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Office number for everything else <span class="text-gray-400">(optional)</span></label>
                    <input type="text" name="wa_office_phone" value="<?= e($settings['wa_office_phone'] ?? '') ?>" placeholder="e.g. 0722 123 456" class="w-full sm:w-72 px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <p class="text-[11px] text-gray-500 mt-1">This number is automated — once it's on the API nobody can chat from it on a phone. The assistant tells parents to call or WhatsApp the office number here for anything it can't answer (sickness, complaints, a payment plan).</p>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Managers who get Ask Tuta on WhatsApp <span class="text-gray-400">(optional)</span></label>
                    <input type="text" name="wa_ask_phones" value="<?= e($settings['wa_ask_phones'] ?? '') ?>" placeholder="0722 123 456, 0733 987 654 group" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <p class="text-[11px] text-gray-500 mt-1">These numbers text the same line and get the AI assistant — "how much did we collect this week?", "who owes most in Grade 5?" — instead of the parent menu. Add the word <span class="font-mono">group</span> after a number to let it ask across every branch. School administrators and group admins with a phone on their profile get it automatically.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Callback URL <span class="text-gray-400">(copy into Meta)</span></label>
                        <input type="text" readonly value="<?= e($webhookUrl) ?>" onclick="this.select()" class="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-mono text-gray-700">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Verify token <span class="text-gray-400">(copy into Meta)</span></label>
                        <input type="text" name="wa_verify_token" value="<?= e($verifyTok) ?>" placeholder="generated on save" onclick="this.select()" class="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-mono text-gray-700">
                        <p class="text-[11px] text-gray-400 mt-1">Leave blank and Save to generate one.</p>
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">App secret <span class="text-gray-400">(from Meta → App settings → Basic)</span></label>
                        <div class="flex gap-2">
                            <input type="password" name="wa_app_secret" id="waSecretField" value="<?= e($settings['wa_app_secret'] ?? '') ?>" autocomplete="off" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
                            <button type="button" onclick="var f=document.getElementById('waSecretField');f.type=f.type==='password'?'text':'password';this.textContent=f.type==='password'?'Show':'Hide';" class="px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex-none">Show</button>
                        </div>
                        <p class="text-[11px] text-gray-400 mt-1">Lets Tuta check each incoming message really came from Meta. Works without it, but set it before parents use this.</p>
                    </div>
                </div>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">API version <span class="text-gray-400">(advanced)</span></label>
                <input type="text" name="wa_api_version" value="<?= e($settings['wa_api_version'] ?? 'v21.0') ?>" class="w-full max-w-[10rem] px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm font-mono">
            </div>

            <button type="submit" class="mt-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save WhatsApp settings</button>
        </form>

        <?php // Hidden delete forms for the template list above — outside the settings form so nothing nests.
        if (!empty($tplList['templates'])): $seenDel = [];
            foreach ($tplList['templates'] as $t): if ($t['status'] === 'APPROVED' || isset($seenDel[$t['name']])) continue; $seenDel[$t['name']] = true; ?>
        <form method="POST" id="delTpl_<?= md5($t['name']) ?>" class="hidden">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="delete_wa_template">
            <input type="hidden" name="template_name" value="<?= e($t['name']) ?>">
        </form>
            <?php endforeach; endif; ?>

        <?php $std = whatsappStandardReminderTemplate(); ?>
        <div class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
            <p class="text-sm font-semibold text-gray-800 mb-1">Don't have a reminder template yet?</p>
            <p class="text-xs text-gray-600 mb-2">Tuta can submit its standard one to Meta for approval on your account. Save the WABA ID and token above first. Approval is usually minutes; it appears in the template list as <span class="font-mono"><?= e($std['name']) ?></span> and reminders switch to it automatically. The date in the name keeps each submission unique — Meta holds old names for a month.</p>
            <p class="text-xs text-gray-700 bg-white border border-emerald-100 rounded-lg px-3 py-2 mb-3 italic">"<?= e($std['body']) ?>"</p>
            <form method="POST" onsubmit="return confirm('Submit the standard fee-reminder template to Meta for approval?')">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="create_wa_template">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Submit template to Meta</button>
            </form>
        </div>

        <div class="mt-6 pt-5 border-t border-gray-100" id="wa-test">
            <h3 class="text-sm font-semibold text-gray-700 mb-1">Send a test message</h3>
            <p class="text-xs text-gray-500 mb-3">Save first. The test sends your approved template with the school name as its first variable; if the template has no variables Tuta retries without.</p>
            <?php
            // The last few attempts, right here where the button is — the result
            // line at the top of the page is easy to miss on a tab this far down.
            $waTests = $sb->from('audit_logs')->select('created_at,user_email,payload')
                ->eq('school_id', $sid)->eq('action', 'test_whatsapp')->order('created_at', false)->limit(5)->execute()['data'] ?? [];
            if ($waTests): ?>
            <div class="mb-4 rounded-lg border border-gray-200 overflow-hidden">
                <div class="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Recent tests</div>
                <div class="divide-y divide-gray-50">
                    <?php foreach ($waTests as $t): $pl = is_string($t['payload'] ?? null) ? (json_decode($t['payload'], true) ?: []) : (array)($t['payload'] ?? []);
                        $ok = !empty($pl['ok']); ?>
                    <div class="px-3 py-2 text-xs flex items-start gap-3">
                        <span class="inline-flex px-1.5 py-0.5 rounded font-semibold flex-none <?= $ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700' ?>"><?= $ok ? 'Accepted' : 'Failed' ?></span>
                        <span class="text-gray-500 flex-none whitespace-nowrap"><?= e(date('j M H:i', strtotime((string)$t['created_at']))) ?></span>
                        <span class="text-gray-700 min-w-0">
                            <?php if (!empty($pl['phone'])): ?>to <?= e($pl['phone']) ?><?php endif; ?>
                            <?php if ($ok): ?><span class="text-gray-400"> · Meta accepted it; delivery to the handset follows within seconds</span>
                            <?php elseif (!empty($pl['error'])): ?><span class="text-red-700"> · <?= e($pl['error']) ?></span>
                            <?php else: ?><span class="text-gray-400"> · reason not recorded (older version)</span><?php endif; ?>
                        </span>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>
            <form method="POST" class="flex gap-2 flex-wrap items-start">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="test_whatsapp">
                <input type="text" name="test_wa_phone" required placeholder="07XX XXX XXX" class="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm w-48">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Send test WhatsApp</button>
            </form>
        </div>
    </div>
    <p class="text-xs text-gray-400 mt-3">WhatsApp carries documents (report cards as PDF) which SMS cannot. Keep SMS for short reminders — it is cheaper per message.</p>
</div>

<?php endif; ?>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- Modals (shared across tabs)                              -->
<!-- ═══════════════════════════════════════════════════════ -->

<!-- Edit Year Modal -->
<div id="editYearModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Academic Year</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_year">
            <input type="hidden" name="year_id" id="eyId">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Name</label>
                <input type="text" name="year_name" id="eyName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="grid grid-cols-2 gap-2 mb-4">
                <input type="date" name="year_start" id="eyStart" required class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <input type="date" name="year_end" id="eyEnd" required class="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
                <button type="button" onclick="document.getElementById('editYearModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Term Modal -->
<div id="editTermModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Term</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_term">
            <input type="hidden" name="term_id" id="etId">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Name</label>
                <input type="text" name="term_name" id="etName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="grid grid-cols-2 gap-2 mb-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Start</label>
                    <input type="date" name="term_start" id="etStart" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">End</label>
                    <input type="date" name="term_end" id="etEnd" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-xs text-gray-500 mb-1">Fee Due Date</label>
                <input type="date" name="term_due" id="etDue" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
                <button type="button" onclick="document.getElementById('editTermModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Subject Modal -->
<div id="editSubModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Subject</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_subject">
            <input type="hidden" name="subject_id" id="esId">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Name</label>
                <input type="text" name="subject_name" id="esName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="mb-4">
                <label class="block text-sm text-gray-600 mb-1">Code</label>
                <input type="text" name="subject_code" id="esCode" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
                <button type="button" onclick="document.getElementById('editSubModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Scheme Modal -->
<div id="editSchemeModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Grading Scheme</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit_scheme">
            <input type="hidden" name="scheme_id" id="schId">
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Name</label>
                <input type="text" name="scheme_name" id="schName" required class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="mb-4">
                <label class="block text-sm text-gray-600 mb-1">Type</label>
                <select name="scheme_type" id="schType" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="competency">Competency (EE / ME / AE / BE)</option>
                    <option value="marks">Marks (letter grades)</option>
                </select>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save</button>
                <button type="button" onclick="document.getElementById('editSchemeModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Grade Band Modal (add + edit) -->
<div id="bandModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4" id="bandModalTitle">Add Grade Band</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" id="bandAction" value="add_band">
            <input type="hidden" name="scheme_id" id="bandSchemeId">
            <input type="hidden" name="band_id" id="bandId">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Grade code</label>
                    <input type="text" name="band_code" id="bandCode" required placeholder="e.g. EE" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                </div>
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Points</label>
                    <input type="number" name="band_points" id="bandPoints" step="1" placeholder="optional" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                </div>
            </div>
            <div class="mb-3">
                <label class="block text-sm text-gray-600 mb-1">Label</label>
                <input type="text" name="band_label" id="bandLabel" required placeholder="e.g. Exceeding Expectations" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            </div>
            <div class="grid grid-cols-3 gap-3 mb-4">
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Min %</label>
                    <input type="number" name="band_min" id="bandMin" required min="0" max="100" step="0.01" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                </div>
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Max %</label>
                    <input type="number" name="band_max" id="bandMax" required min="0" max="100" step="0.01" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                </div>
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Colour</label>
                    <input type="color" name="band_color" id="bandColor" value="#10b981" class="w-full h-[38px] px-1 py-1 rounded-lg border border-gray-200 cursor-pointer bg-white">
                </div>
            </div>
            <p class="text-xs text-gray-400 mb-4">A score lands in the band whose Min % it reaches. Bands are matched highest-first, so ranges never need to line up perfectly.</p>
            <div class="flex gap-3">
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Save Band</button>
                <button type="button" onclick="document.getElementById('bandModal').classList.add('hidden')" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function editYear(id, name, start, end) {
    document.getElementById('eyId').value = id;
    document.getElementById('eyName').value = name;
    document.getElementById('eyStart').value = start ? start.substring(0,10) : '';
    document.getElementById('eyEnd').value = end ? end.substring(0,10) : '';
    document.getElementById('editYearModal').classList.remove('hidden');
}
function editTerm(id, name, start, end) {
    document.getElementById('etId').value = id;
    document.getElementById('etName').value = name;
    document.getElementById('etStart').value = start ? start.substring(0,10) : '';
    document.getElementById('etEnd').value = end ? end.substring(0,10) : '';
    document.getElementById('etDue').value = '';
    document.getElementById('editTermModal').classList.remove('hidden');
}
function editSubject(id, name, code) {
    document.getElementById('esId').value = id;
    document.getElementById('esName').value = name;
    document.getElementById('esCode').value = code;
    document.getElementById('editSubModal').classList.remove('hidden');
}
function editScheme(id, name, type) {
    document.getElementById('schId').value = id;
    document.getElementById('schName').value = name;
    document.getElementById('schType').value = type;
    document.getElementById('editSchemeModal').classList.remove('hidden');
}
function bandModal(action, schemeId, bandId, code, label, min, max, points, color) {
    document.getElementById('bandAction').value = action;
    document.getElementById('bandSchemeId').value = schemeId;
    document.getElementById('bandId').value = bandId;
    document.getElementById('bandCode').value = code;
    document.getElementById('bandLabel').value = label;
    document.getElementById('bandMin').value = min;
    document.getElementById('bandMax').value = max;
    document.getElementById('bandPoints').value = points;
    document.getElementById('bandColor').value = color || '#10b981';
    document.getElementById('bandModalTitle').textContent = (action === 'add_band') ? 'Add Grade Band' : 'Edit Grade Band';
    document.getElementById('bandModal').classList.remove('hidden');
}
</script>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
