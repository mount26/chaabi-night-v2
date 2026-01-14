import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.css']
})
export class AdminLoginComponent {
  username = '';
  password = '';
  errorMessage = '';

  constructor(private router: Router) {}

  login(): void {
    const validUser = 'admin';
    const validPass = 'admin123';
    if (this.username === validUser && this.password === validPass) {
      localStorage.setItem('isAdmin', 'true');
      this.router.navigateByUrl('/admin-dashboard');
    } else {
      this.errorMessage = 'Nom d\u2019utilisateur ou mot de passe incorrect.';
    }
  }
}