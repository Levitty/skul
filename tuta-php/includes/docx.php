<?php
/**
 * Read the text out of a .docx — paragraphs, headings, list items — so a
 * Word document the office uploaded can be shown inline on a phone instead
 * of forcing a download. Same ZipArchive + SimpleXML route as xlsx.php; no
 * Composer, nothing to install on the server.
 */

/** Plain text with one paragraph per line; '' if it isn't a readable .docx. */
function docxExtractText(string $pathOrUrl): string
{
    if (!class_exists('ZipArchive')) return '';
    $tmp = null;
    $path = $pathOrUrl;
    if (preg_match('#^https?://#i', $pathOrUrl)) {
        $ctx = stream_context_create(['http' => ['timeout' => 15]]);
        $bytes = @file_get_contents($pathOrUrl, false, $ctx);
        if ($bytes === false || strlen($bytes) < 100 || strlen($bytes) > 15 * 1024 * 1024) return '';
        $tmp = tempnam(sys_get_temp_dir(), 'docx');
        file_put_contents($tmp, $bytes);
        $path = $tmp;
    }
    $out = '';
    try {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) return '';
        $xml = $zip->getFromName('word/document.xml');
        $zip->close();
        if ($xml === false) return '';
        // Paragraph and line breaks become newlines; tabs a space; everything
        // else is dropped. Entities are decoded after tags are gone.
        $xml = preg_replace('#</w:p>#', "\n", $xml);
        $xml = preg_replace('#<w:br[^>]*/>#', "\n", $xml);
        $xml = preg_replace('#<w:tab[^>]*/>#', ' ', $xml);
        $text = strip_tags($xml);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
        $lines = array_map(fn($l) => trim(preg_replace('/[ \t]+/', ' ', $l)), explode("\n", $text));
        // Collapse runs of blank lines to one.
        $prevBlank = false;
        foreach ($lines as $l) {
            if (preg_match('/^\d{6,}$/', $l)) continue;          // Word's internal ids, not text
            if ($l === '') { if (!$prevBlank) $out .= "\n"; $prevBlank = true; continue; }
            $out .= $l . "\n"; $prevBlank = false;
        }
    } finally {
        if ($tmp) @unlink($tmp);
    }
    return trim($out);
}
