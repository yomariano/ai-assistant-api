/**
 * Script to sync full call details from Vapi to call_history table
 * This fetches transcript, summary, recording_url, etc. for existing calls
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchVapiCallDetails(callId) {
  const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.VAPI_API_KEY}`
    }
  });

  if (!response.ok) {
    console.log('Failed to fetch call', callId, response.status);
    return null;
  }

  return response.json();
}

async function syncCallDetails() {
  // Get all calls that need updating (have vapi_call_id but missing details)
  const { data: calls, error } = await supabase
    .from('call_history')
    .select('id, vapi_call_id')
    .not('vapi_call_id', 'is', null);

  if (error) {
    console.log('Error fetching calls:', error.message);
    return;
  }

  console.log('Found', calls.length, 'calls to update\n');

  let updated = 0;
  let failed = 0;

  for (const call of calls) {
    const vapiCall = await fetchVapiCallDetails(call.vapi_call_id);

    if (!vapiCall) {
      failed++;
      continue;
    }

    // Extract transcript as text
    let transcriptText = null;
    if (vapiCall.transcript) {
      transcriptText = vapiCall.transcript;
    } else if (vapiCall.messages) {
      transcriptText = vapiCall.messages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role}: ${m.content || m.message || ''}`)
        .join('\n');
    }

    // Calculate duration from timestamps
    let durationSeconds = null;
    if (vapiCall.startedAt && vapiCall.endedAt) {
      const start = new Date(vapiCall.startedAt);
      const end = new Date(vapiCall.endedAt);
      durationSeconds = Math.round((end - start) / 1000);
    }

    const updateData = {
      transcript: transcriptText,
      summary: vapiCall.summary || vapiCall.analysis?.summary || null,
      recording_url: vapiCall.recordingUrl || null,
      ended_reason: vapiCall.endedReason || null,
      duration_seconds: durationSeconds
    };

    // Calculate cost if available (Vapi returns cost in dollars)
    if (vapiCall.cost) {
      updateData.vapi_cost_cents = Math.round(vapiCall.cost * 100);
    }

    const { error: updateError } = await supabase
      .from('call_history')
      .update(updateData)
      .eq('id', call.id);

    if (updateError) {
      console.log('Error updating call', call.id, '-', updateError.message);
      failed++;
    } else {
      updated++;
      const shortId = call.vapi_call_id.slice(0, 8);
      console.log(`[${updated}/${calls.length}] Updated ${shortId} - recording: ${!!updateData.recording_url}, transcript: ${!!updateData.transcript}, duration: ${updateData.duration_seconds}s`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n========================================');
  console.log('Sync complete!');
  console.log(`Updated: ${updated}, Failed: ${failed}`);
}

syncCallDetails().catch(console.error);
