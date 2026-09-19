export const categories = [
  { id: 'studio', name: 'Roblox Studio', icon: '◈', color: 'blue', description: 'Your first world starts here.' },
  { id: 'scripting', name: 'Luau & Scripting', icon: '⌘', color: 'purple', description: 'Bring your ideas to life with code.' },
  { id: 'building', name: 'Building & Design', icon: '▧', color: 'orange', description: 'Create worlds worth exploring.' },
  { id: 'gameplay', name: 'Game Systems', icon: '⚡', color: 'green', description: 'Turn a place into an experience.' },
  { id: 'ui', name: 'UI & UX', icon: '▣', color: 'pink', description: 'Make every interaction feel right.' },
  { id: 'shipping', name: 'Publish & Grow', icon: '↗', color: 'cyan', description: 'Launch, learn, and keep improving.' }
];

const articleBlueprints = {
  studio: [
    'Roblox Studio Basics', 'Explorer and Properties', 'Building a Safe Spawn Area', 'Lighting and Materials'
  ],
  scripting: [
    'Luau Variables and Types', 'Functions and Events', 'RemoteEvents and Data', 'Inventory Logic'
  ],
  building: [
    'Map Layout and Flow', 'Creating Good Spawn Points', 'Materials, Props, and Theme', 'World Readability'
  ],
  gameplay: [
    'Core Game Loop', 'Progression and Rewards', 'Difficulty and Balance', 'Retention and Replay'
  ],
  ui: [
    'UI Layout Basics', 'Buttons and Menus', 'HUD and Feedback', 'Shop and Inventory UI'
  ],
  shipping: [
    'Testing Before Launch', 'Publishing Your Experience', 'Community and Updates', 'Growing a Player Base'
  ]
};

const levelByCategory = {
  studio: ['Beginner', 'Beginner', 'Intermediate', 'Intermediate'],
  scripting: ['Beginner', 'Beginner', 'Intermediate', 'Intermediate'],
  building: ['Beginner', 'Beginner', 'Intermediate', 'Intermediate'],
  gameplay: ['Beginner', 'Intermediate', 'Intermediate', 'Intermediate'],
  ui: ['Beginner', 'Beginner', 'Intermediate', 'Intermediate'],
  shipping: ['Beginner', 'Intermediate', 'Intermediate', 'Intermediate']
};

const minutesByCategory = {
  studio: [10, 12, 14, 16],
  scripting: [12, 14, 18, 16],
  building: [14, 13, 15, 17],
  gameplay: [15, 18, 20, 17],
  ui: [12, 15, 18, 16],
  shipping: [12, 16, 18, 20]
};

function buildArticle(category, title, level, minutes, index) {
  return {
    id: `${category}-${String(index + 1).padStart(2, '0')}`,
    title,
    category,
    level,
    summary: `A practical Roblox guide explaining ${title.toLowerCase()} with clear steps, real developer habits, and useful examples.`,
    body: [
      `Learn the real foundations of ${title.toLowerCase()} before adding bigger systems.`,
      `Use clean structure in Studio, keep scripts readable, and test often in Play mode to catch bugs early.`,
      `Good Roblox games are built by making simple systems work well, then improving them through feedback and iteration.`,
      `Focus on player clarity, reliable mechanics, and a smooth start-to-finish experience.`,
      `This topic matters because most games improve when the basics are stable, clean, and easy to understand.`
    ],
    minutes,
    status: 'published',
    source: 'Soft Production: Game Group Knowledge Base'
  };
}

export const articles = Object.entries(articleBlueprints).flatMap(([category, titles]) =>
  titles.map((title, index) => buildArticle(category, title, levelByCategory[category][index], minutesByCategory[category][index], index))
);
