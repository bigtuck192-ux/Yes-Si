import { Component, ChangeDetectionStrategy, signal, OnDestroy, AfterViewInit, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Update AppTheme import to break circular dependency
import { AppTheme } from '../../services/user-context.service';

const BASE_OCTAVE = 3;
const NUMBER_OF_OCTAVES = 2;
const STEPS_PER_BAR = 16;

export interface PianoRollNote { midi: number; name: string; octave: number; }
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ALL_NOTES: PianoRollNote[] = [];

for (let octave = BASE_OCTAVE; octave < BASE_OCTAVE + NUMBER_OF_OCTAVES; octave++) {
  for (let i = 0; i < 12; i++) {
    ALL_NOTES.push({ midi: 60 + (octave - 4) * 12 + i, name: NOTE_NAMES[i], octave });
  }
}
ALL_NOTES.reverse();

@Component({
  selector: 'app-piano-roll',
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PianoRollComponent implements OnDestroy {
  theme = input.required<AppTheme>();
  allNotes = ALL_NOTES;
  bpm = signal(120);
  isPlaying = signal(false);
  currentStep = signal(-1);
  sequence = signal<Map<number, boolean[]>>(new Map());

  private audioContext: AudioContext | null = null;
  private masterGainNode?: GainNode;
  
  // --- Precision Scheduling ---
  private nextNoteTime = 0.0;
  private readonly scheduleAheadTime = 0.1; // seconds
  private lookaheadTimerId?: number;

  constructor() {
    this.initializeEmptySequence();
  }

  ngOnDestroy(): void {
    this.stop();
    this.audioContext?.close();
  }

  private initializeEmptySequence(): void {
    const newSequence = new Map<number, boolean[]>();
    this.allNotes.forEach(note => newSequence.set(note.midi, Array(STEPS_PER_BAR).fill(false)));
    this.sequence.set(newSequence);
  }

  private async initAudio(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = 0.5;
      this.masterGainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
  }

  async togglePlay(): Promise<void> {
    await this.initAudio();
    this.isPlaying.update(p => !p);
    if (this.isPlaying()) this.start(); else this.stop();
  }

  start(): void {
    if (!this.audioContext) return;
    if (this.currentStep() === -1) this.currentStep.set(0);
    this.nextNoteTime = this.audioContext.currentTime;
    this.scheduler();
  }

  stop(): void {
    if (this.lookaheadTimerId) clearTimeout(this.lookaheadTimerId);
  }

  resetSequence(): void {
    this.isPlaying.set(false);
    this.stop();
    this.currentStep.set(-1);
    this.initializeEmptySequence();
  }

  private scheduler(): void {
    if (!this.isPlaying() || !this.audioContext) return;
    
    while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
      this.playStep(this.currentStep(), this.nextNoteTime);
      this.advanceStep();
    }
    this.lookaheadTimerId = window.setTimeout(() => this.scheduler(), 25);
  }

  private advanceStep(): void {
    const secondsPerStep = 60.0 / this.bpm() / 4.0;
    this.nextNoteTime += secondsPerStep;
    this.currentStep.update(s => (s + 1) % STEPS_PER_BAR);
  }

  private playStep(step: number, time: number): void {
    this.sequence().forEach((stepsForNote, midiNote) => {
      if (stepsForNote[step]) this.playNote(midiNote, time);
    });
  }

  private playNote(midiNote: number, startTime: number): void {
    if (!this.audioContext || !this.masterGainNode) return;
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gainNode.gain.setValueAtTime(0.3, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.5);
    oscillator.connect(gainNode);
    gainNode.connect(this.masterGainNode);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.5);
  }

  toggleNote(midiNote: number, stepIndex: number): void {
    this.sequence.update(currentSequence => {
      const stepsForNote = currentSequence.get(midiNote)!;
      stepsForNote[stepIndex] = !stepsForNote[stepIndex];
      return new Map(currentSequence);
    });
  }

  onBpmChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) this.bpm.set(value);
  }

  getNoteDisplay(note: PianoRollNote): string { return `${note.name}${note.octave}`; }
}
