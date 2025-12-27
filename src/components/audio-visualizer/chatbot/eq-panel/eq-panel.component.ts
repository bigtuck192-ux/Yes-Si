import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Update AppTheme import to break circular dependency
import { AppTheme, EqBand, Enhancements } from '../../services/user-context.service';

@Component({
  selector: 'app-eq-panel',
  templateUrl: './eq-panel.component.html',
  styleUrls: ['./eq-panel.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EqPanelComponent {
  eqSettings = input.required<EqBand[]>();
  enhancements = input.required<Enhancements>();
  theme = input.required<AppTheme>();

  close = output<void>();
  eqChange = output<EqBand[]>();
  enhancementsChange = output<Enhancements>();

  onEqBandChange(index: number, event: Event): void {
    const newValue = parseInt((event.target as HTMLInputElement).value, 10);
    const newSettings = this.eqSettings().map((band, i) =>
      i === index ? { ...band, value: newValue } : band
    );
    this.eqChange.emit(newSettings);
  }

  onEnhancementToggle(key: keyof Enhancements): void {
    this.enhancementsChange.emit({ ...this.enhancements(), [key]: !this.enhancements()[key] });
  }

  onClose(): void {
    this.close.emit();
  }
}