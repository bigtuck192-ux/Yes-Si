import { Component, ChangeDetectionStrategy, inject, signal, input } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Update AppTheme import to break circular dependency
import { AppTheme } from '../../../services/user-context.service';
import { UserProfileService, UserProfile } from '../../../services/user-profile.service';

@Component({
  selector: 'app-profile-editor',
  templateUrl: './profile-editor.component.html',
  styleUrls: ['./profile-editor.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditorComponent {
  theme = input.required<AppTheme>();
  private userProfileService = inject(UserProfileService);
  
  editableProfile = signal<UserProfile>({ ...this.userProfileService.profile() });
  saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  
  readonly ALL_SKILLS = ['Vocalist', 'Producer', 'Songwriter', 'DJ', 'Guitarist', 'Bassist', 'Drummer', 'Keyboardist', 'Sound Designer'];
  readonly ALL_GOALS = ['Get Signed', 'Grow Fanbase', 'License Music', 'Tour', 'Collaborate', 'Improve Skills'];
  
  readonly socialPlatforms = ['Facebook', 'Twitter', 'Instagram', 'TikTok', 'Threads'];
  readonly musicPlatforms = ['Spotify', 'Apple Music', 'SoundCloud', 'YouTube', 'Bandcamp', 'Tidal', 'iHeartRadio'];
  readonly proPlatforms = ['ASCAP', 'BMI', 'SESAC', 'SoundExchange', 'The MLC', 'AllTrack'];

  saveProfile(): void {
    this.saveStatus.set('saving');
    this.userProfileService.updateProfile(this.editableProfile());
    setTimeout(() => {
        this.saveStatus.set('saved');
        setTimeout(() => this.saveStatus.set('idle'), 2000);
    }, 500);
  }
  
  updateField(fieldName: keyof UserProfile, event: Event): void {
      const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
      this.editableProfile.update(p => ({ ...p, [fieldName]: value }));
  }

  onSkillChange(skill: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editableProfile.update(p => {
      const skills = new Set(p.skills);
      if (checked) skills.add(skill);
      else skills.delete(skill);
      return { ...p, skills: Array.from(skills) };
    });
  }

  onGoalChange(goal: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editableProfile.update(p => {
      const goals = new Set(p.careerGoals);
      if (checked) goals.add(goal);
      else goals.delete(goal);
      return { ...p, careerGoals: Array.from(goals) };
    });
  }
  
  updateLinkField(platform: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.editableProfile.update(p => ({
      ...p,
      links: {
        ...p.links,
        [platform]: value
      }
    }));
  }
}