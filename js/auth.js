/**
 * auth.js
 * ─────────────────────────────────────────────
 * Purpose: Handles login, register, and forgot-password forms.
 *          - Login           → index.html (loginForm)
 *          - Register        → register.html (registerForm)
 *          - Forgot password → index.html (forgotForm, inside a modal)
 *
 * APPROVAL SYSTEM:
 *   New signups are created with approved:false in Firestore (/users/{uid}).
 *   They are immediately signed out after registration and shown a
 *   "pending approval" message instead of being dropped into the dashboard.
 *   Login also checks this flag — an unapproved account is blocked at
 *   sign-in time with a clear message, even if the password is correct.
 *   You (the admin) approve people from Settings → Team Members.
 *
 * Depends on: firebase-config.js (window.firebaseAuth, window.firebaseDb)
 *             notify-config.js   (window.NOTIFY_CONFIG) — optional email alert
 */

document.addEventListener('DOMContentLoaded', () => {
  const auth = window.firebaseAuth;
  const db   = window.firebaseDb;

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
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const user = credential.user;

        // Check approval status before letting them in
        let approved = true; // default: don't lock people out if doc is missing (legacy accounts)
        if (db) {
          const doc = await db.collection('users').doc(user.uid).get();
          if (doc.exists && doc.data().approved === false) {
            approved = false;
          }
        }

        if (!approved) {
          await auth.signOut();
          showFormError(errorBox, 'Your account is awaiting admin approval. You will be able to sign in once it has been approved.');
          setLoading(loginBtn, false, 'Sign In');
          return;
        }

        window.location.href = 'pages/dashboard.html';
      } catch (err) {
        console.error('Login error:', err.code, err.message);
        showFormError(errorBox, friendlyError(err.code));
        setLoading(loginBtn, false, 'Sign In');
      }
    });
  }

  // ── FORGOT PASSWORD ──────────────────────────────────────────────────────
  const forgotLink  = document.getElementById('forgotPasswordLink');
  const forgotModal = document.getElementById('forgotModal');
  const forgotForm  = document.getElementById('forgotForm');
  const forgotClose = document.getElementById('forgotClose');
  const forgotMsg   = document.getElementById('forgotMsg');

  if (forgotLink && forgotModal) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      forgotMsg.classList.add('hidden');
      forgotModal.classList.remove('hidden');
      const emailField = document.getElementById('forgotEmail');
      const loginEmail = document.getElementById('email');
      if (loginEmail && loginEmail.value) emailField.value = loginEmail.value.trim();
    });
    forgotClose.addEventListener('click', () => forgotModal.classList.add('hidden'));
    forgotModal.addEventListener('click', (e) => {
      if (e.target === forgotModal) forgotModal.classList.add('hidden');
    });

    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmail').value.trim();
      const btn   = document.getElementById('forgotBtn');
      setLoading(btn, true, 'Sending…');
      forgotMsg.classList.add('hidden');
      try {
        await auth.sendPasswordResetEmail(email);
        forgotMsg.className = 'success-msg';
        forgotMsg.textContent = 'A password reset link has been sent to ' + email + '. Check your inbox (and spam folder).';
        forgotMsg.classList.remove('hidden');
      } catch (err) {
        console.error('Reset error:', err.code, err.message);
        forgotMsg.className = 'error-msg';
        forgotMsg.textContent = friendlyError(err.code);
        forgotMsg.classList.remove('hidden');
      } finally {
        setLoading(btn, false, 'Send Reset Link');
      }
    });
  }

  // ── REGISTER FORM ─────────────────────────────────────────────────────────
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    const errorBox    = document.getElementById('registerError');
    const registerBtn = document.getElementById('registerBtn');
    const successBox  = document.getElementById('registerSuccess');

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('displayName').value.trim();
      const email       = document.getElementById('email').value.trim();
      const password    = document.getElementById('password').value;
      const confirm     = document.getElementById('confirmPassword').value;

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
      if (successBox) successBox.classList.add('hidden');

      try {
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        await credential.user.updateProfile({ displayName });

        // Honor a pre-authorized role if this email was added under
        // Settings → Team Members → Send Invite
        let role = 'staff';
        if (db) {
          try {
            const invited = await db.collection('users')
              .where('email', '==', email)
              .where('status', '==', 'invited')
              .limit(1)
              .get();
            if (!invited.empty) {
              role = invited.docs[0].data().role || 'staff';
              await invited.docs[0].ref.delete();
            }
          } catch (lookupErr) {
            console.warn('Invite lookup skipped:', lookupErr.message);
          }

          await db.collection('users').doc(credential.user.uid).set({
            displayName,
            email,
            role,
            approved: false,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }

        notifyAdminOfNewSignup(displayName, email);

        await auth.signOut();

        registerForm.reset();
        registerForm.classList.add('hidden');
        if (successBox) {
          successBox.textContent = `You're registered, ${displayName.split(' ')[0]}! Your account is now pending admin approval. You'll be able to sign in as soon as it's approved.`;
          successBox.classList.remove('hidden');
        }
      } catch (err) {
        console.error('Register error:', err.code, err.message);
        showFormError(errorBox, friendlyError(err.code));
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
    box.className = 'error-msg';
    box.textContent = message;
    box.classList.remove('hidden');
  }

  function friendlyError(code) {
    const map = {
      'auth/user-not-found':            'No account found with that email.',
      'auth/wrong-password':            'Wrong password. Please try again.',
      'auth/invalid-credential':        'Wrong email or password. Please try again.',
      'auth/invalid-login-credentials': 'Wrong email or password. Please try again.',
      'auth/invalid-email':             'Please enter a valid email address.',
      'auth/email-already-in-use':      'An account with this email already exists.',
      'auth/weak-password':             'Password must be at least 6 characters.',
      'auth/too-many-requests':         'Too many attempts. Please wait a moment and try again.',
      'auth/network-request-failed':    'Network error. Check your connection and try again.',
      'auth/user-disabled':             'This account has been disabled.',
      'auth/missing-email':             'Please enter your email address.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  }

  function notifyAdminOfNewSignup(name, email) {
    const cfg = window.NOTIFY_CONFIG;
    if (!cfg || !cfg.enabled || typeof emailjs === 'undefined') return;
    try {
      emailjs.send(cfg.serviceId, cfg.templateId, {
        user_name:   name,
        user_email:  email,
        signup_time: new Date().toLocaleString(),
        to_email:    cfg.adminEmail,
      }, cfg.publicKey).catch((err) => console.warn('Admin notify email failed:', err));
    } catch (err) {
      console.warn('Admin notify email failed:', err);
    }
  }
});
