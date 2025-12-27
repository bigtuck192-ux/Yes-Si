
import { Injectable, signal, effect } from '@angular/core';

export interface UserProfile {
  artistName: string;
  primaryGenre: string;
  secondaryGenres: string[];
  skills: string[];
  careerGoals: string[];
  currentFocus: string;
  influences: string;
  bio: string;
  links: { [key: string]: string; };
}

export const initialProfile: UserProfile = {
  artistName: 'New Artist',
  primaryGenre: '',
  secondaryGenres: [],
  skills: [],
  careerGoals: [],
  currentFocus: '',
  influences: '',
  bio: 'Describe your musical journey...',
  links: {},
};

const USER_PROFILE_STORAGE_KEY = 'aura_user_profile';

@Injectable({
  providedIn: 'root'
})
export class UserProfileService {
  profile = signal<UserProfile>(initialProfile);

  constructor() {
    this.loadProfileFromStorage();
    effect(() => {
      this.saveProfileToStorage(this.profile());
    });
  }

  private loadProfileFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawProfile = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
        
        if (rawProfile) {
          const storedProfile = rawProfile.trim();
          
          // Strict validation to prevent JSON.parse("undefined") error
          if (storedProfile && 
              storedProfile !== "undefined" && 
              storedProfile !== "null" &&
              storedProfile !== "") {
            try {
              const parsedProfile = JSON.parse(storedProfile);
              if (parsedProfile && typeof parsedProfile === 'object') {
                if (!parsedProfile.links) {
                  parsedProfile.links = {};
                }
                this.profile.set(parsedProfile);
              }
            } catch (jsonError) {
               console.warn("UserProfileService: Invalid JSON in storage, resetting.", jsonError);
               localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
            }
          } else {
             // Clean up invalid values
             localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
          }
        }
      } catch (e) {
        console.error("UserProfileService: Failed to access storage.", e);
      }
    }
  }

  private saveProfileToStorage(profile: UserProfile): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!profile) return;
      try {
        const json = JSON.stringify(profile);
        // Prevent saving "undefined" string
        if (json && json !== "undefined" && json !== "null") {
            localStorage.setItem(USER_PROFILE_STORAGE_KEY, json);
        }
      } catch (e) {
        console.error("UserProfileService: Failed to save profile to storage.", e);
      }
    }
  }

  updateProfile(newProfile: UserProfile): void {
    this.profile.set(newProfile);
  }
}
