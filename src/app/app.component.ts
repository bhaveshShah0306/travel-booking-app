// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { OfflineIndicatorComponent } from './shared/components/offline-indicator/offline-indicator.component';
import { DataInitService } from './core/services/data-init.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, OfflineIndicatorComponent],
  template: `
    <app-offline-indicator></app-offline-indicator>
    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        background-attachment: fixed;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  constructor(private dataInitService: DataInitService) {}

  async ngOnInit(): Promise<void> {
    try {
      // Initialize sample data on app start
      await this.dataInitService.initializeSampleData();
      console.log('✅ App initialized successfully');
    } catch (error) {
      console.error('❌ App initialization failed:', error);
    }
  }
}
