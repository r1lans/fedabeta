/* TheStarth — attention check for the student's own device. The video NEVER leaves the device:
 * a face-landmark model runs locally in the browser, only a status ('ok' | 'off') is returned.
 *   LessonAttention.start(videoTrack, onState)  -> Promise<boolean> (false if not supported)
 *   LessonAttention.stop()
 */
(function () {
  'use strict';
  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  let lm = null, vid = null, timer = 0, cb = null, last = '', offSince = 0, loading = null;

  function load() {
    if (loading) return loading;
    loading = import(CDN + '/vision_bundle.mjs').then(async (m) => {
      const fs = await m.FilesetResolver.forVisionTasks(CDN + '/wasm');
      return m.FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numFaces: 1 });
    });
    return loading;
  }
  // yaw ratio of the nose between the cheeks: ~0.5 = facing the screen
  function judge(res) {
    const f = res && res.faceLandmarks && res.faceLandmarks[0];
    if (!f) return 'off';
    const n = f[1], l = f[234], r = f[454]; if (!n || !l || !r) return 'off';
    const w = r.x - l.x; if (Math.abs(w) < 0.02) return 'off';
    const yaw = (n.x - l.x) / w;
    return yaw < 0.3 || yaw > 0.7 ? 'off' : 'ok';
  }
  async function start(track, onState) {
    stop();
    if (!track) return false;
    try { lm = await load(); } catch (e) { console.warn('attention model', e); loading = null; return false; }
    cb = onState; vid = document.createElement('video'); vid.muted = true; vid.playsInline = true;
    vid.srcObject = new MediaStream([track]); try { await vid.play(); } catch (e) {}
    last = ''; offSince = 0;
    timer = setInterval(() => {
      if (!vid || vid.readyState < 2 || !track.enabled || track.readyState !== 'live') { emit(''); return; }
      let st = 'ok';
      try { st = judge(lm.detectForVideo(vid, performance.now())); } catch (e) { return; }
      // «off» only after 4 s in a row, to avoid flicker on blinks or short glances away
      if (st === 'off') { if (!offSince) offSince = Date.now(); if (Date.now() - offSince < 4000) st = last || 'ok'; } else offSince = 0;
      emit(st);
    }, 500);
    return true;
  }
  function emit(s) { if (s !== last) { last = s; if (cb) cb(s); } }
  function stop() { clearInterval(timer); timer = 0; if (vid) { try { vid.srcObject = null; } catch (e) {} vid = null; } cb = null; last = ''; offSince = 0; }
  window.LessonAttention = { start, stop };
})();
