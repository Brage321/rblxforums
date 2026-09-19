const state = {
  category: 'all',
  search: '',
  articles: [],
  posts: [],
  users: [],
  selectedUser: null,
  user: null,
};

const categoryMeta = {
  all: 'All topics',
  studio: 'Studio',
  scripting: 'Scripting',
  building: 'Building',
  gameplay: 'Gameplay',
  ui: 'UI & UX',
  shipping: 'Publish & Grow',
};

const refs = {
  articleGrid: document.getElementById('articleGrid'),
  forumPosts: document.getElementById('forumPosts'),
  userList: document.getElementById('userList'),
  userSearchInput: document.getElementById('userSearchInput'),
  profileName: document.getElementById('profileName'),
  profileCard: document.getElementById('profileCard'),
  categoryFilters: document.getElementById('categoryFilters'),
  signupForm: document.getElementById('signupForm'),
  loginForm: document.getElementById('loginForm'),
  postForm: document.getElementById('postForm'),
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('searchButton'),
  libraryButton: document.getElementById('libraryButton'),
  authStatus: document.getElementById('authStatus'),
  articleMetric: document.getElementById('articleMetric'),
  memberMetric: document.getElementById('memberMetric'),
  forumMetric: document.getElementById('forumMetric'),
  statusText: document.getElementById('statusText'),
};

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed.');
  }

  return data;
}

function updateAuthStatus() {
  if (state.user) {
    refs.authStatus.textContent = `Signed in as ${state.user.name}${state.user.verified ? ' ✅' : ''}`;
    refs.authStatus.style.background = 'rgba(92, 225, 184, 0.12)';
    refs.authStatus.style.borderColor = 'rgba(92, 225, 184, 0.3)';
    refs.authStatus.style.color = '#dffbf0';
  } else {
    refs.authStatus.textContent = 'Not signed in yet';
    refs.authStatus.style.background = 'rgba(255, 255, 255, 0.04)';
    refs.authStatus.style.borderColor = 'rgba(146, 170, 204, 0.18)';
    refs.authStatus.style.color = '#edf3ff';
  }
}

function createCategoryFilters() {
  if (!refs.categoryFilters) return;

  const categories = [
    { id: 'all', name: 'All Topics' },
    { id: 'studio', name: 'Studio' },
    { id: 'scripting', name: 'Scripting' },
    { id: 'building', name: 'Building' },
    { id: 'gameplay', name: 'Gameplay' },
    { id: 'ui', name: 'UI & UX' },
    { id: 'shipping', name: 'Publish' },
  ];

  refs.categoryFilters.innerHTML = categories
    .map(
      (category) => `
        <button class="filter-chip ${state.category === category.id ? 'active' : ''}" data-category="${category.id}">
          ${category.name}
        </button>
      `
    )
    .join('');

  refs.categoryFilters.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.category = button.dataset.category;
    createCategoryFilters();
    await loadArticles();
  });
}

function renderArticles() {
  if (!refs.articleGrid) return;

  if (!state.articles.length) {
    refs.articleGrid.innerHTML = '<div class="empty-state">No articles match that search yet. Try a broader query or switch categories.</div>';
    return;
  }

  refs.articleGrid.innerHTML = state.articles
    .map(
      (article) => `
        <article class="article-card">
          <div class="article-header">
            <span class="category-badge">${categoryMeta[article.category] || article.category}</span>
            <span class="level-pill">${article.level}</span>
          </div>
          <h3>${article.title}</h3>
          <p>${article.summary}</p>
          <div class="meta-row">
            <span>${article.minutes} min</span>
            <span>${article.source}</span>
          </div>
          <div class="article-footer">
            <span class="meta-badge">Focus: ${article.category}</span>
            <button class="ghost-button" type="button">Read guide</button>
          </div>
        </article>
      `
    )
    .join('');
}

function renderPosts() {
  if (!state.posts.length) {
    refs.forumPosts.innerHTML = '<div class="empty-state">No forum discussions yet. Start the conversation with a build challenge.</div>';
    return;
  }

  refs.forumPosts.innerHTML = state.posts
    .map(
      (post) => `
        <article class="forum-post">
          <div class="post-title-row">
            <h4>${post.title}</h4>
            <span class="meta-badge">${post.pinned ? 'Pinned' : categoryMeta[post.category] || post.category}</span>
          </div>
          <p class="post-body">${post.body}</p>
          <div class="meta-row">
            <span>By <button class="inline-user-button" data-user-id="${post.user_id}" type="button">${post.author_name}</button></span>
            <span>${new Date(post.created).toLocaleDateString()}</span>
          </div>

          <div class="profile-actions">
            ${state.user && state.user.verified ? `<button class="ghost-button" type="button" data-pin-id="${post.id}" data-pinned="${post.pinned ? 1 : 0}">${post.pinned ? 'Unpin' : 'Pin to top'}</button>` : ''}
          </div>

          <ul class="comment-list">
            ${(post.comments || [])
              .map(
                (comment) => `
                  <li class="comment-item">
                    <strong>${comment.author_name}</strong>
                    <div>${comment.body}</div>
                  </li>
                `
              )
              .join('') || '<li class="comment-item">No comments yet — start the discussion.</li>'}
          </ul>

          <form class="comment-form" data-post-id="${post.id}">
            <input type="text" name="comment" placeholder="Add a useful comment..." required />
            <button class="ghost-button" type="submit">Comment</button>
          </form>
        </article>
      `
    )
    .join('');

  refs.forumPosts.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = Number(button.dataset.userId);
      if (userId) {
        await loadUserProfile(userId);
      }
    });
  });

  refs.forumPosts.querySelectorAll('[data-pin-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const postId = Number(button.dataset.pinId);
      const pinnedNow = button.dataset.pinned === '1' ? 0 : 1;
      try {
        await fetchJson('/api/pin-post', {
          method: 'POST',
          body: JSON.stringify({ postId, pinned: pinnedNow })
        });
        await loadPosts();
      } catch (error) {
        refs.statusText.textContent = error.message;
      }
    });
  });
}

function renderUserList() {
  const query = refs.userSearchInput.value.trim().toLowerCase();
  const filtered = state.users.filter((user) => `${user.name} ${user.bio}`.toLowerCase().includes(query));

  if (!filtered.length) {
    refs.userList.innerHTML = '<div class="empty-state">No creators match that search.</div>';
    return;
  }

  refs.userList.innerHTML = filtered
    .map(
      (user) => `
        <button class="user-card" type="button" data-user-id="${user.id}">
          <div class="user-main">
            <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
            <div class="user-info">
              <strong>${user.name}${user.verified ? ' ✓' : ''}</strong>
              <small>${user.post_count} posts · ${user.followers_count} followers</small>
            </div>
          </div>
          ${user.verified ? '<span class="verified-badge">✅ Verified</span>' : ''}
        </button>
      `
    )
    .join('');

  refs.userList.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = Number(button.dataset.userId);
      await loadUserProfile(userId);
    });
  });
}

function renderProfileCard() {
  if (!state.selectedUser) {
    refs.profileName.textContent = 'No creator selected';
    refs.profileCard.innerHTML = 'Choose a user to view their profile.';
    return;
  }

  const defaultVerifiedText = 'Verified Developer: This account has been checked by Soft Production: Game Group and marked as a trusted creator for community guidance and pinned updates.';
  const verifiedText = state.selectedUser.verified_text || defaultVerifiedText;
  const badges = state.selectedUser.verified ? '<span class="verified-badge" id="verifiedBadge">✅ Verified Developer</span>' : '';
  refs.profileName.textContent = state.selectedUser.name;
  refs.profileCard.innerHTML = `
    <div class="profile-header">
      <h4>${state.selectedUser.name}</h4>
      ${badges}
    </div>
    <div class="meta-row">
      <span>${state.selectedUser.post_count} posts</span>
      <span>${state.selectedUser.followers_count} followers</span>
      <span>${state.selectedUser.following_count} following</span>
    </div>
    <p class="profile-bio">${state.selectedUser.bio || 'This creator has not written a bio yet.'}</p>
    <div class="profile-actions">
      <button class="primary-button" id="followButton" type="button">
        ${state.selectedUser.is_following ? 'Unfollow' : 'Follow'}
      </button>
    </div>
    ${state.user && state.user.name === 'Soft Production' ? `
      <div class="admin-controls" style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px;">
        <label style="display: block; margin-bottom: 8px;">
          <input type="checkbox" id="verifiedToggle" ${state.selectedUser.verified ? 'checked' : ''} />
          Give this user a verified badge
        </label>
        <label style="display: block; margin-bottom: 8px;">
          <span style="display: block; margin-bottom: 6px;">Verified Developer text</span>
          <textarea id="verifiedTextInput" rows="3" style="width: 100%; resize: vertical;">${verifiedText}</textarea>
        </label>
        <button class="ghost-button" id="saveVerification" type="button">Save verification</button>
      </div>
    ` : ''}
    <div id="verifiedTooltip" class="tooltip-box" style="display: none;">
      ${verifiedText}
    </div>
  `;

  const verifiedBadge = document.getElementById('verifiedBadge');
  if (verifiedBadge) {
    verifiedBadge.addEventListener('click', () => {
      const tooltip = document.getElementById('verifiedTooltip');
      if (tooltip) {
        tooltip.style.display = tooltip.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  const followButton = document.getElementById('followButton');
  if (followButton) {
    followButton.addEventListener('click', async () => {
      if (!state.user) {
        refs.statusText.textContent = 'Please sign in to follow creators.';
        return;
      }
      try {
        const result = await fetchJson('/api/follow', {
          method: 'POST',
          body: JSON.stringify({ userId: state.selectedUser.id })
        });
        state.selectedUser.is_following = result.followed;
        await loadUsers();
        renderProfileCard();
      } catch (error) {
        refs.statusText.textContent = error.message;
      }
    });
  }

  const saveVerificationButton = document.getElementById('saveVerification');
  if (saveVerificationButton) {
    saveVerificationButton.addEventListener('click', async () => {
      const verifiedToggle = document.getElementById('verifiedToggle');
      const verifiedTextInput = document.getElementById('verifiedTextInput');
      try {
        const result = await fetchJson('/api/verify-user', {
          method: 'POST',
          body: JSON.stringify({
            userId: state.selectedUser.id,
            verified: verifiedToggle ? verifiedToggle.checked : false,
            verifiedText: verifiedTextInput ? verifiedTextInput.value : ''
          })
        });
        refs.statusText.textContent = result.message;
        state.selectedUser = result.user;
        await loadUsers();
        renderProfileCard();
      } catch (error) {
        refs.statusText.textContent = error.message;
      }
    });
  }
}

async function loadOverview() {
  const data = await fetchJson('/api/overview');
  if (refs.articleMetric) refs.articleMetric.textContent = data.userCount;
  if (refs.memberMetric) refs.memberMetric.textContent = data.userCount;
  if (refs.forumMetric) refs.forumMetric.textContent = data.postCount;
  if (refs.statusText) refs.statusText.textContent = `Live community for ${data.brand}.`;
}

async function loadArticles() {
  if (!refs.articleGrid) return;

  const params = new URLSearchParams();
  if (state.category !== 'all') params.set('category', state.category);
  if (state.search.trim()) params.set('search', state.search.trim());

  const data = await fetchJson(`/api/articles?${params.toString()}`);
  state.articles = data.articles || [];
  renderArticles();
}

async function loadUsers() {
  const data = await fetchJson('/api/users');
  state.users = data.users || [];
  renderUserList();
}

async function loadUserProfile(userId) {
  const data = await fetchJson(`/api/users?id=${userId}`);
  state.selectedUser = data.user || null;
  if (!state.selectedUser) {
    refs.profileName.textContent = 'User not found';
    refs.profileCard.innerHTML = '<div class="empty-state">This creator could not be found.</div>';
    return;
  }

  state.selectedUser.posts = data.posts || [];
  renderProfileCard();
  renderProfilePosts();
}

function renderProfilePosts() {
  if (!state.selectedUser) return;

  const old = refs.profileCard.parentElement.querySelector('.profile-posts');
  if (old) old.remove();

  if (!state.selectedUser.posts || !state.selectedUser.posts.length) {
    const wrapper = document.createElement('div');
    wrapper.className = 'profile-posts';
    wrapper.innerHTML = '<div class="empty-state">This creator has not posted anything yet.</div>';
    refs.profileCard.parentElement.appendChild(wrapper);
    return;
  }

  const postsMarkup = state.selectedUser.posts
    .map(
      (post) => `
        <article class="forum-post">
          <div class="post-title-row">
            <h4>${post.title}</h4>
            <span class="meta-badge">${post.pinned ? 'Pinned' : categoryMeta[post.category] || post.category}</span>
          </div>
          <p class="post-body">${post.body}</p>
          <div class="meta-row">
            <span>${new Date(post.created).toLocaleDateString()}</span>
          </div>
        </article>
      `
    )
    .join('');

  const wrapper = document.createElement('div');
  wrapper.className = 'profile-posts';
  wrapper.innerHTML = `<div class="forum-list">${postsMarkup}</div>`;
  refs.profileCard.parentElement.appendChild(wrapper);
}

async function loadPosts() {
  const data = await fetchJson('/api/posts');
  const allPosts = data.posts || [];
  const query = state.search.trim().toLowerCase();
  state.posts = query
    ? allPosts.filter((post) => `${post.title} ${post.body} ${post.author_name}`.toLowerCase().includes(query))
    : allPosts;
  renderPosts();
}

async function getCurrentUser() {
  const data = await fetchJson('/api/me');
  state.user = data.user || null;
  updateAuthStatus();
}

refs.userSearchInput.addEventListener('input', () => {
  renderUserList();
});

refs.searchButton.addEventListener('click', async () => {
  if (!refs.searchInput) return;
  state.search = refs.searchInput.value;
  await loadPosts();
});

refs.searchInput.addEventListener('keydown', async (event) => {
  if (!refs.searchInput) return;
  if (event.key === 'Enter') {
    state.search = refs.searchInput.value;
    await loadPosts();
  }
});

refs.libraryButton.addEventListener('click', () => {
  const forumTarget = document.getElementById('forum');
  if (forumTarget) forumTarget.scrollIntoView({ behavior: 'smooth' });
});

refs.signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    name: form.get('name'),
    email: form.get('email'),
    password: form.get('password'),
  };

  try {
    const result = await fetchJson('/api/signup', { method: 'POST', body: JSON.stringify(payload) });
    state.user = result.user;
    updateAuthStatus();
    refs.signupForm.reset();
    refs.statusText.textContent = result.message;
    await loadUsers();
  } catch (error) {
    refs.statusText.textContent = error.message;
  }
});

refs.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    email: form.get('email'),
    password: form.get('password'),
  };

  try {
    const result = await fetchJson('/api/login', { method: 'POST', body: JSON.stringify(payload) });
    state.user = result.user;
    updateAuthStatus();
    refs.loginForm.reset();
    refs.statusText.textContent = result.message;
    await loadUsers();
    await loadPosts();
  } catch (error) {
    refs.statusText.textContent = error.message;
  }
});

refs.postForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    title: form.get('title'),
    body: form.get('body'),
    category: form.get('category'),
    name: state.user ? state.user.name : 'Guest Creator',
  };

  if (!state.user) {
    refs.statusText.textContent = 'Please sign in to create a forum post.';
    return;
  }

  try {
    await fetchJson('/api/posts', { method: 'POST', body: JSON.stringify(payload) });
    refs.postForm.reset();
    await loadPosts();
    await loadUsers();
    refs.statusText.textContent = 'Forum post published successfully.';
  } catch (error) {
    refs.statusText.textContent = error.message;
  }
});

refs.forumPosts.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-post-id]');
  if (!form) return;

  event.preventDefault();
  const input = form.querySelector('input[name="comment"]');
  const postId = Number(form.dataset.postId);
  const payload = {
    postId,
    body: input.value,
    name: state.user ? state.user.name : 'Guest commenter',
  };

  if (!state.user) {
    refs.statusText.textContent = 'Please sign in to comment.';
    return;
  }

  try {
    await fetchJson('/api/comments', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    await loadPosts();
  } catch (error) {
    refs.statusText.textContent = error.message;
  }
});

async function init() {
  createCategoryFilters();
  await getCurrentUser();
  await loadOverview();
  await loadUsers();
  await loadPosts();
}

init();
