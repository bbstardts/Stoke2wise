/**
 * auth.js
 * ─────────────────────────────────────────────
 * Purpose: Handles login, register, and forgot-password forms.
 *          - Login           → index.html (loginForm)
 *          - Register        → register.html (registerForm)
 *          - Forgot password → index.html (forgotForm, inside a modal)
 *          - Google sign-in  → index.html / register.html (googleSignInBtn)
 *
 * ACCOUNT LINKING:
 *   If someone registered with email/password and later clicks
 *   "Continue with Google" using that same email, Firebase throws
 *   auth/account-exists-with-different-credential instead of letting
 *   them in. We catch that, ask for their existing password, and link
 *   the Google credential to that account (linkAccountModal) so both
 *   sign-in methods work afterward.
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

        // Wait for the login timestamp to actually finish writing before we
        // navigate away — otherwise the redirect can cut the request off
        // mid-flight. Capped at 3s so a slow/offline connection never
        // blocks someone from getting into the app.
        await Promise.race([
          recordLogin(user.uid),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
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
        if (err.code === 'auth/email-already-in-use') {
          try {
            const methods = await auth.fetchSignInMethodsForEmail(email);
            if (methods.includes('google.com') && !methods.includes('password')) {
              showFormError(errorBox, 'An account with this email already exists, signed up with Google. Please use "Continue with Google" below to sign in.');
            } else {
              showFormError(errorBox, 'An account with this email already exists. Please sign in instead, or use "Forgot password?" if you don\'t remember your password.');
            }
          } catch (_) {
            showFormError(errorBox, friendlyError(err.code));
          }
        } else {
          showFormError(errorBox, friendlyError(err.code));
        }
      } finally {
        setLoading(registerBtn, false, 'Create Account');
      }
    });
  }

  // ── GOOGLE SIGN-IN / SIGN-UP ─────────────────────────────────────────────
  const googleBtn = document.getElementById('googleSignInBtn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      googleBtn.disabled = true;
      try {
        const result = await auth.signInWithPopup(provider);
        const user   = result.user;
        const email  = user.email || '';

        // Firebase may silently create a brand-new auth user for this
        // Google sign-in even though an email/password account with the
        // same email already exists (this happens whenever "One account
        // per email address" isn't enforced in the Firebase console).
        // Check Firestore ourselves for a pre-existing account with this
        // email so we don't end up with two separate accounts.
        if (db && email) {
          const existing = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();

          if (!existing.empty && existing.docs[0].id !== user.uid) {
            const pendingCred = result.credential || null;
            // This Google sign-in just minted a fresh, empty auth user —
            // discard it, then ask for the existing account's password
            // and link Google to that account instead.
            try { await user.delete(); } catch (_) { try { await auth.signOut(); } catch (_) {} }
            openLinkAccountModal({ email, credential: pendingCred });
            return;
          }
        }

        await handlePostAuth(user, { fullName: user.displayName || '', email }, /* emailKnown */ true);
      } catch (err) {
        console.error('Google sign-in error:', err.code, err.message);
        if (err.code === 'auth/account-exists-with-different-credential') {
          // This email already has a password-based account. Instead of
          // failing, ask for the password and link the Google credential
          // to that existing account so future sign-ins can use either.
          openLinkAccountModal(err);
        } else if (err.code !== 'auth/popup-closed-by-user') {
          customAlert(friendlyError(err.code), 'error');
        }
      } finally {
        googleBtn.disabled = false;
      }
    });
  }

  // ── LINK ACCOUNT (Google email already registered with a password) ──────
  function openLinkAccountModal(err) {
    const modal = document.getElementById('linkAccountModal');
    if (!modal) return;

    // Different SDK builds surface these differently — try every known shape.
    const email = err.email
      || (err.customData && err.customData.email)
      || '';

    let pendingCred = err.credential || null;
    if (!pendingCred && firebase.auth.GoogleAuthProvider.credentialFromError) {
      try { pendingCred = firebase.auth.GoogleAuthProvider.credentialFromError(err); } catch (_) {}
    }

    console.log('[link-account] email:', email, '| got credential:', !!pendingCred);

    const msgBox          = document.getElementById('linkAccountMsg');
    const emailGroup       = document.getElementById('linkEmailGroup');
    const emailField       = document.getElementById('linkEmail');
    const passwordField    = document.getElementById('linkPassword');
    const linkError        = document.getElementById('linkAccountError');
    const linkCancel       = document.getElementById('linkAccountCancelBtn');
    const form             = document.getElementById('linkAccountForm');

    if (email) {
      emailField.value = email;
      emailGroup.classList.add('hidden');
    } else {
      emailField.value = '';
      emailGroup.classList.remove('hidden');
    }

    msgBox.textContent = email
      ? `${email} is already registered with a password. Enter that password to link your Google account.`
      : 'This email is already registered with a password. Enter that password to link your Google account.';
    passwordField.value = '';
    linkError.classList.add('hidden');
    modal.classList.remove('hidden');

    form.onsubmit = async (e) => {
      e.preventDefault();
      const submittedEmail = emailField.value.trim();
      const password = passwordField.value;

      if (!submittedEmail) { showFormError(linkError, 'Please enter your email address.'); return; }

      const btn = document.getElementById('linkAccountSubmitBtn');
      setLoading(btn, true, 'Linking…');
      linkError.classList.add('hidden');
      try {
        const credential = await auth.signInWithEmailAndPassword(submittedEmail, password);
        if (pendingCred) {
          try {
            await credential.user.linkWithCredential(pendingCred);
            console.log('[link-account] Google credential linked successfully.');
          } catch (linkWarn) {
            // Already linked (e.g. retried after a previous success) — not fatal.
            console.warn('[link-account] link warning:', linkWarn.code, linkWarn.message);
          }
        } else {
          console.warn('[link-account] No Google credential was captured, so Google was NOT linked. You are signed in with your password only — try Continue with Google again next time.');
        }
        modal.classList.add('hidden');
        await handlePostAuth(credential.user, {
          fullName: credential.user.displayName || '',
          email: credential.user.email || ''
        }, /* emailKnown */ true);
      } catch (linkErr) {
        console.error('Account link error:', linkErr.code, linkErr.message);
        showFormError(linkError, friendlyError(linkErr.code));
      } finally {
        setLoading(btn, false, 'Link & Sign In');
      }
    };

    if (linkCancel) {
      linkCancel.onclick = () => modal.classList.add('hidden');
    }
  }

  // ── Route new vs. returning users after Google auth ──────────────────────
  async function handlePostAuth(user, prefill, emailKnown) {
    if (!db) { window.location.href = 'pages/dashboard.html'; return; }

    const doc = await db.collection('users').doc(user.uid).get();

    if (doc.exists) {
      if (doc.data().approved === false) {
        await auth.signOut();
        window.location.href = 'index.html?pending=1';
        return;
      }
      await Promise.race([
        recordLogin(user.uid),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
      window.location.href = 'pages/dashboard.html';
      return;
    }

    // Brand-new account → ask for their name before submitting for approval
    openCompleteProfile(user, prefill);
  }

  function openCompleteProfile(user, prefill) {
    const modal = document.getElementById('completeProfileModal');
    if (!modal) { finishSignup(user, prefill); return; }

    const nameField  = document.getElementById('cpFullName');
    const cpError    = document.getElementById('cpError');
    const cpCancel   = document.getElementById('cpCancelBtn');
    const email      = prefill.email || '';

    nameField.value  = prefill.fullName || '';
    cpError.classList.add('hidden');

    modal.classList.remove('hidden');

    const form = document.getElementById('completeProfileForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fullName = nameField.value.trim();

      if (!fullName) { showFormError(cpError, 'Please enter your full name.'); return; }

      const btn = document.getElementById('cpSubmitBtn');
      setLoading(btn, true, 'Submitting…');
      try {
        await finishSignup(user, { fullName, email });
        modal.classList.add('hidden');
      } catch (err) {
        console.error('Profile completion error:', err);
        showFormError(cpError, 'Something went wrong. Please try again.');
        setLoading(btn, false, 'Finish & Submit for Approval');
      }
    };

    if (cpCancel) {
      cpCancel.onclick = async () => {
        modal.classList.add('hidden');
        try { await auth.signOut(); } catch (_) {}
      };
    }
  }

  async function finishSignup(user, { fullName, email }) {
    if (fullName) {
      try { await user.updateProfile({ displayName: fullName }); } catch (_) {}
    }

    await db.collection('users').doc(user.uid).set({
      displayName: fullName || user.displayName || '',
      email:       email || user.email || '',
      role:        'staff',
      approved:    false,
      status:      'pending',
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    });

    notifyAdminOfNewSignup(fullName || user.displayName || 'New user', email || user.email || '');

    await auth.signOut();
    window.location.href = 'index.html?pending=1';
  }

  // ── Login tracking ───────────────────────────────────────────────────────
  // Stamps /users/{uid} with the time of this sign-in so Settings → Team
  // Members can show "Last active", and appends a row to
  // /users/{uid}/loginHistory so admins can see a full sign-in log (not
  // just the most recent one) via the History button in Settings.
  // Never blocks the redirect — a failure here should never stop someone
  // from logging in.
  function recordLogin(uid) {
    if (!db || !uid) return Promise.resolve();
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    return Promise.all([
      db.collection('users').doc(uid).set({ lastLogin: ts }, { merge: true }),
      db.collection('users').doc(uid).collection('loginHistory').add({
        timestamp: ts,
        device: getDeviceLabel()
      })
    ]).catch(err => console.warn('recordLogin failed:', err.message));
  }

  // Best-effort, readable "Browser on OS" label from the user agent string.
  // Not meant to be precise device fingerprinting — just enough for an
  // admin skimming the login history to recognize "yep, that's my laptop."
  function getDeviceLabel() {
    const ua = navigator.userAgent || '';
    let browser = 'Unknown browser';
    if (/Edg\//.test(ua))                          browser = 'Edge';
    else if (/OPR\//.test(ua))                     browser = 'Opera';
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua))                 browser = 'Firefox';
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua))   browser = 'Safari';

    let os = 'Unknown OS';
    if (/Windows/.test(ua))            os = 'Windows';
    else if (/Mac OS X/.test(ua))      os = 'macOS';
    else if (/Android/.test(ua))       os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Linux/.test(ua))         os = 'Linux';

    return `${browser} on ${os}`;
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
