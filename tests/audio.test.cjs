'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const {AudioController}=require('../.test-build/platform/audio');

// Web Audio/HTMLMediaElement are browser boundaries. Inspect actual controller
// graph/envelopes and lifecycle here; audible playback is verified in the browser.
function harness(){
 const contexts=[],media=[];
 class Param{constructor(value=0){this.value=value;this.events=[];}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}linearRampToValueAtTime(v,t){this.events.push(['linear',v,t]);}exponentialRampToValueAtTime(v,t){this.events.push(['exponential',v,t]);}setTargetAtTime(v,t,k){this.value=v;this.events.push(['target',v,t,k]);}}
 class AudioNode{constructor(kind){this.kind=kind;this.connections=[];this.gain=new Param(1);this.frequency=new Param();this.Q=new Param();this.playbackRate=new Param(1);}connect(n){this.connections.push(n);return n;}disconnect(){this.disconnected=true;}start(t=0){this.started=t;}stop(t=0){this.stopped=t;}}
 class Context{constructor(){this.sampleRate=8000;this.currentTime=10;this.state='suspended';this.destination=new AudioNode('destination');this.nodes=[];contexts.push(this);}make(kind){const n=new AudioNode(kind);this.nodes.push(n);return n;}createGain(){return this.make('gain');}createOscillator(){return this.make('oscillator');}createBufferSource(){return this.make('buffer');}createBiquadFilter(){return this.make('filter');}createMediaElementSource(el){const n=this.make('media');n.media=el;return n;}createBuffer(ch,length,rate){const data=Array.from({length:ch},()=>new Float32Array(length));return {sampleRate:rate,numberOfChannels:ch,length,getChannelData:i=>data[i]};}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}}
 class Media{constructor(){this.paused=true;this.currentTime=37;this.plays=0;media.push(this);}async play(){this.plays++;if(this.rejectPlay){this.rejectPlay=false;throw new Error('NotAllowedError');}this.paused=false;}pause(){this.paused=true;}removeAttribute(key){delete this[key];}load(){}}
 global.AudioContext=Context;global.Audio=Media;
 const audio=new AudioController();
 function signature(type,wave=1){const c=contexts[0],offset=c.nodes.length;audio.feedback(type,wave);return c.nodes.slice(offset).map(n=>({kind:n.kind,type:n.type,frequency:n.frequency.value,f:n.frequency.events,g:n.gain.events,start:n.started,stop:n.stopped}));}
 return {audio,contexts,media,signature};
}

test('local piano waits for activation, reuses its track, and keeps playback position across pause/settings',async()=>{
 const h=harness(),s=h.audio;s.setPianoUrl('/native/NightPiano.mp3');a.equal(h.contexts.length,0);a.ok(h.media.every(m=>m.paused));
 await s.activate();const c=h.contexts[0],m=h.media[0];a.equal(m.src,'/native/NightPiano.mp3');a.equal(m.loop,true);a.equal(m.paused,false);a.equal(c.nodes.filter(n=>n.kind==='media').length,1);
 await s.activate();await s.activate();a.equal(h.contexts.length,1);a.equal(m.plays,1);
 s.suspend();a.equal(m.paused,true);a.equal(c.state,'suspended');await s.resume();a.equal(m.paused,false);a.equal(m.currentTime,37);
 s.setSettings({music:false,sfx:true});a.equal(m.paused,true);await s.activate();a.equal(m.paused,true);s.setSettings({music:true,sfx:true});await Promise.resolve();a.equal(m.paused,false);a.equal(m.currentTime,37);
});
test('late piano load starts only on an active session and autoplay rejection retries on the next gesture',async()=>{
 const h=harness();await h.audio.activate();h.audio.suspend();h.audio.setPianoUrl('/late.mp3');a.equal(h.media[0].paused,true);h.media[0].rejectPlay=true;await h.audio.resume();a.equal(h.media[0].paused,true);await h.audio.activate();a.equal(h.media[0].paused,false);
});
test('rain has a restrained audible noise bed without the old sustained sine drone',async()=>{
 const h=harness();await h.audio.activate();const c=h.contexts[0],r=c.nodes.find(n=>n.kind==='buffer'&&n.loop);a.ok(r,'rain loops locally');a.equal(c.nodes.filter(n=>n.kind==='oscillator').length,0);
 const d=r.buffer.getChannelData(0),rms=Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length);a.ok(rms>.08&&rms<.4,'rain noise retains detail without full-scale noise');
 const filters=c.nodes.filter(n=>n.kind==='filter');a.ok(filters.some(n=>n.type==='highpass'));a.ok(filters.some(n=>n.type==='lowpass'&&n.frequency.value>=2000));
});
test('rain intensity survives activation and maps zero, light and heavy rain to a bounded independent gain',async()=>{
 const h=harness(),s=h.audio;s.setRainIntensity(.25);s.setPianoUrl('/piano.mp3');await s.activate();const gain=s.rainGain.gain,piano=s.pianoGain.gain;
 const light=gain.value;a.ok(light>0);a.equal(s.rainIntensity,.25);a.equal(piano.value,.45);
 s.setRainIntensity(1);const heavy=gain.value;a.ok(heavy>light&&heavy<=.085);s.setRainIntensity(20);a.equal(gain.value,heavy);a.equal(s.rainIntensity,1);
 s.setRainIntensity(0);a.equal(gain.value,0);s.setRainIntensity(-2);a.equal(gain.value,0);a.equal(s.rainIntensity,0);a.equal(piano.value,.45);a.deepEqual(piano.events,[]);
});
test('weather changes smooth the same rain source, filter tiny updates without losing slow changes, and always reach silence',async()=>{
 const h=harness(),s=h.audio;await s.activate();const c=h.contexts[0],count=c.nodes.length,gain=s.rainGain.gain;
 s.setRainIntensity(.5);const event=gain.events.at(-1);a.equal(event[0],'target');a.equal(event[2],c.currentTime);a.ok(event[3]>=.3&&event[3]<=.8);
 const events=gain.events.length;s.setRainIntensity(.502);s.setRainIntensity(.504);a.equal(gain.events.length,events);s.setRainIntensity(.506);a.equal(gain.events.length,events+1);
 s.setRainIntensity(.003);s.setRainIntensity(0);a.equal(gain.events.at(-1)[1],0);const silentEvents=gain.events.length;s.setRainIntensity(0);a.equal(gain.events.length,silentEvents);
 a.equal(c.nodes.length,count);a.equal(c.nodes.filter(n=>n.kind==='buffer'&&n.loop).length,1);a.equal(c.nodes.filter(n=>n.kind==='oscillator').length,0);
});
test('changing rain while muted or suspended retains weather without changing music mute or piano playback position',async()=>{
 const h=harness(),s=h.audio;s.setPianoUrl('/piano.mp3');await s.activate();const master=s.music.gain,piano=s.pianoGain.gain;
 s.setSettings({music:false,sfx:true});s.setRainIntensity(.8);a.equal(master.value,0);a.equal(h.media[0].paused,true);a.equal(piano.value,.45);
 s.suspend();s.setRainIntensity(.3);await s.resume();a.equal(s.rainIntensity,.3);a.equal(master.value,0);a.equal(h.media[0].paused,true);
 s.setSettings({music:true,sfx:true});await Promise.resolve();a.equal(s.rainIntensity,.3);a.equal(s.rainGain.gain.value,.07*.3);a.equal(h.media[0].currentTime,37);a.equal(h.media[0].paused,false);
});
test('destroy ignores late weather updates and disconnects the rain gain',async()=>{
 const h=harness(),s=h.audio;await s.activate();s.setRainIntensity(.4);const rain=s.rainGain,events=rain.gain.events.length,count=h.contexts[0].nodes.length;
 s.destroy();s.setRainIntensity(.9);await s.activate();a.equal(s.rainIntensity,.4);a.equal(rain.gain.events.length,events);a.equal(rain.disconnected,true);a.equal(h.contexts[0].nodes.length,count);a.equal(h.contexts.length,1);
});
test('four tools use different gestures, timbres and note envelopes',async()=>{
 const h=harness();await h.audio.activate();const types=['tool-breathe','tool-hug','tool-resonate','tool-shuffle'];const signals=types.map(t=>h.signature(t));
 signals.forEach(s=>a.ok(s.some(n=>n.start!==undefined)));a.equal(new Set(signals.map(JSON.stringify)).size,4,'each tool needs an audible identity');
 a.ok(signals[0].some(n=>n.kind==='buffer'),'breath has an airy sweep');a.ok(signals[1].some(n=>n.type==='sine'),'hug has warm rounded tones');a.ok(signals[2].filter(n=>n.kind==='oscillator').length>=3,'resonance rings as a chord');a.ok(signals[3].some(n=>n.f.length>1),'shuffle glides rather than another static beep');
});
test('combo pitch and strength rise within a cap; mute and suspension suppress feedback',async()=>{
 const h=harness();await h.audio.activate();const c=h.contexts[0];const first=h.signature('chain',2),high=h.signature('chain',6),capped=h.signature('chain',99);
 const pitch=s=>Math.max(...s.filter(n=>n.kind==='oscillator').map(n=>n.frequency));const peak=s=>Math.max(...s.flatMap(n=>n.g.filter(e=>e[0]==='linear').map(e=>e[1])));
 a.ok(pitch(high)>pitch(first));a.ok(peak(high)>peak(first));a.deepEqual(high,capped);a.ok(peak(high)<.1);
 h.audio.setSettings({music:true,sfx:false});a.deepEqual(h.signature('tool-hug'),[]);h.audio.setSettings({music:true,sfx:true});h.audio.suspend();a.deepEqual(h.signature('chain',3),[]);a.equal(c.state,'suspended');
});
test('destroy stops background/effects and cannot restart after a late asset callback',async()=>{
 const h=harness();h.audio.setPianoUrl('/piano.mp3');await h.audio.activate();h.audio.feedback('tool-resonate');const c=h.contexts[0];h.audio.destroy();a.equal(c.state,'closed');a.equal(h.media[0].paused,true);a.ok(c.nodes.filter(n=>n.started!==undefined).every(n=>n.stopped!==undefined));h.audio.setPianoUrl('/late.mp3');await h.audio.activate();a.equal(h.contexts.length,1);a.ok(h.media.every(m=>m.paused));
});
