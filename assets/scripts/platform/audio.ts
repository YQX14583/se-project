export interface AudioSettings {music:boolean;sfx:boolean}
export class AudioController {
 private settings:AudioSettings={music:true,sfx:true};private context:AudioContext|null=null;private music:GainNode|null=null;private sources:AudioScheduledSourceNode[]=[];private effects=new Set<AudioScheduledSourceNode>();private paused=false;private disposed=false;
 private piano:HTMLAudioElement|null=null;private pianoSource:MediaElementAudioSourceNode|null=null;private pianoGain:GainNode|null=null;private pianoUrl='';private pianoStarting=false;
 private rainGain:GainNode|null=null;private rainIntensity=1;private appliedRainIntensity=1;
 setSettings(settings:AudioSettings):void {this.settings={...settings};if(this.music&&this.context)this.music.gain.setTargetAtTime(settings.music?1:0,this.context.currentTime,.15);if(!settings.music)this.piano?.pause();else void this.playPiano();}
 setRainIntensity(value:number):void {
  if(this.disposed)return;this.rainIntensity=Math.max(0,Math.min(1,value));if(!this.rainGain||!this.context)return;
  const delta=Math.abs(this.rainIntensity-this.appliedRainIntensity);if(delta===0||(delta<.005&&this.rainIntensity>0&&this.rainIntensity<1))return;
  this.rainGain.gain.setTargetAtTime(.07*this.rainIntensity,this.context.currentTime,.45);this.appliedRainIntensity=this.rainIntensity;
 }
 setPianoUrl(url:string):void {
  if(this.disposed||!url||url===this.pianoUrl)return;this.pianoUrl=url;this.piano?.pause();this.pianoSource?.disconnect();this.pianoGain?.disconnect();this.pianoSource=null;this.pianoGain=null;
  this.piano=new Audio();this.piano.src=url;this.piano.loop=true;this.piano.preload='auto';this.connectPiano();void this.playPiano();
 }
 async activate():Promise<void> {if(this.disposed)return;try{if(!this.context){const C=(globalThis as any).AudioContext||(globalThis as any).webkitAudioContext;if(!C)return;this.context=new C();this.startBackground();this.connectPiano();}if(!this.paused){await this.context!.resume();await this.playPiano();}}catch{}}
 private connectPiano():void {if(!this.context||!this.music||!this.piano||this.pianoSource)return;this.pianoSource=this.context.createMediaElementSource(this.piano);this.pianoGain=this.context.createGain();this.pianoGain.gain.value=.45;this.pianoSource.connect(this.pianoGain);this.pianoGain.connect(this.music);}
 private async playPiano():Promise<void> {
  const piano=this.piano;if(!piano||this.disposed||this.paused||!this.settings.music||this.context?.state!=='running'||!piano.paused||this.pianoStarting)return;
  this.pianoStarting=true;try{await piano.play();if(this.disposed||this.paused||!this.settings.music||piano!==this.piano)piano.pause();}catch{/* Browser autoplay may wait for the next user gesture. */}finally{this.pianoStarting=false;}
 }
 private startBackground():void {
  const c=this.context!;this.music=c.createGain();this.music.gain.value=this.settings.music?1:0;this.music.connect(c.destination);
  // Stereo filtered rain keeps its fine detail; the supplied piano replaces the drone.
  const buffer=c.createBuffer(2,c.sampleRate*8,c.sampleRate);let seed=78239;
  for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);let previous=0;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;previous=.68*previous+.32*(seed/0x80000000-1);data[i]=previous*.95;}}
  const rain=c.createBufferSource(),low=c.createBiquadFilter(),high=c.createBiquadFilter(),gain=c.createGain();this.rainGain=gain;this.appliedRainIntensity=this.rainIntensity;rain.buffer=buffer;rain.loop=true;low.type='lowpass';low.frequency.value=2800;high.type='highpass';high.frequency.value=180;gain.gain.value=.07*this.rainIntensity;rain.connect(high);high.connect(low);low.connect(gain);gain.connect(this.music);rain.start();this.sources.push(rain);
 }
 private tone(frequency:number,delay:number,duration:number,peak:number,shape:OscillatorType='sine',endFrequency=frequency):void {
  const c=this.context!,now=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=shape;o.frequency.value=frequency;o.frequency.setValueAtTime(frequency,now);if(endFrequency!==frequency)o.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);
  g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(peak,now+Math.min(.035,duration*.18));g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);g.connect(c.destination);this.effects.add(o);o.onended=()=>{o.disconnect();g.disconnect();this.effects.delete(o);};o.start(now);o.stop(now+duration+.03);
 }
 private air(duration:number,peak:number,from:number,to:number):void {
  const c=this.context!,now=c.currentTime,buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);let seed=53713;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/0x80000000-1;}
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(from,now);filter.frequency.exponentialRampToValueAtTime(to,now+duration);gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(peak,now+duration*.24);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);source.connect(filter);filter.connect(gain);gain.connect(c.destination);this.effects.add(source);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.effects.delete(source);};source.start(now);source.stop(now+duration+.03);
 }
 feedback(type:string,wave=1):void {
  const c=this.context;if(!c||this.disposed||this.paused||!this.settings.sfx||c.state!=='running')return;
  try{
   if(type==='tool-breathe'){this.air(.58,.09,1800,420);this.tone(196,.04,.46,.025,'sine',130.81);return;}
   if(type==='tool-hug'){this.tone(196,0,.52,.045);this.tone(293.66,.08,.46,.034);this.tone(392,.16,.37,.018);return;}
   if(type==='tool-resonate'){[523.25,659.25,783.99,1046.5].forEach((f,i)=>this.tone(f,i*.055,.48,.027-i*.003,'triangle'));return;}
   if(type==='tool-shuffle'){this.air(.36,.07,500,2100);[329.63,392,493.88,587.33].forEach((f,i)=>this.tone(f,i*.055,.22,.024,'triangle',f*1.6));return;}
   if(type==='win'){[523.25,659.25,783.99].forEach((f,i)=>this.tone(f,i*.09,.62,.035,'triangle'));return;}
   if(type==='cloud'){this.air(.24,.045,680,220);this.tone(146.83,0,.25,.025,'sine',110);return;}
   if(type==='sadness'){this.tone(523.25,0,.3,.006);return;}
   const stage=Math.min(6,Math.max(1,Math.floor(wave)||1)),ratio=[1,1.125,1.25,1.5,1.667,2][stage-1],base=349.23*ratio,peak=.025+(stage-1)*.005;
   this.tone(base,0,.23+stage*.012,peak,'triangle');if(stage>=3)this.tone(base*1.5,.035,.23,peak*.42,'sine');if(stage>=5)this.tone(base*2,.065,.25,peak*.24,'sine');
  }catch{}
 }
 suspend():void {this.paused=true;this.piano?.pause();this.context?.suspend().catch(()=>{});}
 async resume():Promise<void> {if(this.disposed)return;this.paused=false;if(this.context)try{await this.context.resume();await this.playPiano();}catch{}}
 destroy():void {this.disposed=true;this.piano?.pause();if(this.piano){this.piano.removeAttribute('src');this.piano.load();}this.pianoSource?.disconnect();this.pianoGain?.disconnect();for(const s of [...this.sources,...this.effects])try{s.stop();s.disconnect();}catch{}this.sources=[];this.effects.clear();this.rainGain?.disconnect();this.rainGain=null;this.music?.disconnect();this.context?.close().catch(()=>{});this.context=null;}
}
