<?php
require '/Users/mutualevity/Desktop/tuta-school/tuta-php/config.php';
$ch=curl_init(rtrim(SUPABASE_URL,'/')."/rest/v1/attendance_records?select=*&limit=1");
curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>1,CURLOPT_HTTPHEADER=>['apikey: '.SUPABASE_SERVICE_KEY,'Authorization: Bearer '.SUPABASE_SERVICE_KEY]]);
$r=json_decode(curl_exec($ch),true); echo isset($r['code'])?$r['message']:implode(', ',array_keys($r[0]??[])),"\n";
