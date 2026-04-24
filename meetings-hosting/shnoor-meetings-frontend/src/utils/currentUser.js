export function isAllowedShnoorEmail(email) {
  return `${email || ''}`.trim().toLowerCase().endsWith('@shnoor.com');
}

function parseStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (error) {
    console.error('Failed to parse stored user.', error);
    return null;
  }
}

function persistUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
  window.dispatchEvent(new Event('storage'));
  return user;
}

export function clearStoredUser() {
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('storage'));
}

export function getAllowedStoredUser() {
  const user = parseStoredUser();

  if (!user) {
    return null;
  }

  if (!isAllowedShnoorEmail(user.email)) {
    clearStoredUser();
    return null;
  }

  return user;
}

export function ensureFrontendUserId(user) {
  if (!user) {
    return null;
  }

  if (user.meetingUserId) {
    return user;
  }

  return persistUser({
    ...user,
    meetingUserId: crypto.randomUUID(),
  });
}

export function getCurrentUser() {
  return ensureFrontendUserId(getAllowedStoredUser());
}
