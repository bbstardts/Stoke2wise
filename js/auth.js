/**
 * auth.js
 * ─────────────────────────────────────────────
 * Purpose: Handles login and register forms.
 *          - Login  → index.html (loginForm)
 *          - Register → register.html (registerForm)
 *
 * After successful login/register, redirects to pages/dashboard.html.
 * Depends on: firebase-config.js (window.firebaseAuth)
 */

document.addEventListener('DOMContentLoaded', () => {
  const auth = window.firebaseAuth;

  // ── LOGIN FORM ────────────────────────────────────────────────────────────
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const errorBox = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      setLoading(loginBtn, true, 'Signing in…');
      errorBox.classList.add('hidden');

      try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = 'pages/dashboard.html';
      } catch (err) {
        console.error('Login error:', err.code, err.message);
        errorBox.textContent = friendlyError(err.code) + '  [' + err.code + ']';
        errorBox.classList.remove('hidden');
      } finally {
        setLoading(loginBtn, false, 'Sign In');
      }
    });
  }

  // ── REGISTER FORM ─────────────────────────────────────────────────────────
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    const errorBox   = document.getElementById('registerError');
    const registerBtn = document.getElementById('registerBtn');

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('displayName').value.trim();
      const email       = document.getElementById('email').value.trim();
      const password    = document.getElementById('password').value;
      const confirm     = document.getElementById('confirmPassword').value;

      // Client-side validation
      if (password !== confirm) {
        showFormError(errorBox, 'Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        showFormError(errorBox, 'Password must be at least 6 characters.');
        return;
      }

      setLoading(registerBtn, true, 'Creating account…');
      errorBox.classList.add('hidden');

      try {
        const credential = await auth.createUserWithEmailAndPassword(email, password);

        // Save display name to Firebase Auth profile
        await credential.user.updateProfile({ displayName });

        // Optionally store extra user info in Firestore
        if (window.firebaseDb) {
          await window.firebaseDb.collection('users').doc(credential.user.uid).set({
            displayName,
            email,
            role: 'staff',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }

        window.location.href = 'pages/dashboard.html';
      } catch (err) {
        console.error('Register error:', err.code, err.message);
        showFormError(errorBox, friendlyError(err.code) + '  [' + err.code + ']');
      } finally {
        setLoading(registerBtn, false, 'Create Account');
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function setLoading(btn, isLoading, text) {
    btn.textContent = text;
    btn.disabled    = isLoading;
  }

  function showFormError(box, message) {
    box.textContent = message;
    box.classList.remove('hidden');
  }

  function friendlyError(code) {
    const map = {
      'auth/user-not-found':         'No account found with that email.',
      'auth/wrong-password':         'Incorrect password. Please try again.',
      'auth/invalid-email':          'Please enter a valid email address.',
      'auth/email-already-in-use':   'An account with this email already exists.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/too-many-requests':      'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/invalid-credential':     'Incorrect email or password.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  }
});
