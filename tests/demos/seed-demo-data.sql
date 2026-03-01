-- =============================================================================
-- Demo Seed Data — Rich data for demo recordings
-- Layers ON TOP of supabase/seed.sql (idempotent — ON CONFLICT guards)
-- Run: npm run demo:seed
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FAKE STUDENTS — Default School
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000011',
 'authenticated','authenticated','maria@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"María García"}'::jsonb, now()-interval '45 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000012',
 'authenticated','authenticated','carlos@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Carlos López"}'::jsonb, now()-interval '30 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000013',
 'authenticated','authenticated','sofia@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Sofía Rodríguez"}'::jsonb, now()-interval '25 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000014',
 'authenticated','authenticated','james@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"James Wilson"}'::jsonb, now()-interval '20 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000015',
 'authenticated','authenticated','emma@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Emma Chen"}'::jsonb, now()-interval '15 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000016',
 'authenticated','authenticated','lucas@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Lucas Martínez"}'::jsonb, now()-interval '10 days', now(),'','','',''),

-- FAKE STUDENTS — Code Academy
('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000017',
 'authenticated','authenticated','priya@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Priya Sharma"}'::jsonb, now()-interval '35 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000018',
 'authenticated','authenticated','tyler@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Tyler Brooks"}'::jsonb, now()-interval '28 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000019',
 'authenticated','authenticated','yuki@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Yuki Tanaka"}'::jsonb, now()-interval '22 days', now(),'','','',''),

('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000020',
 'authenticated','authenticated','aisha@demo.com',
 crypt('password123',gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}'::jsonb,
 '{"full_name":"Aisha Okafor"}'::jsonb, now()-interval '18 days', now(),'','','','')
ON CONFLICT (id) DO NOTHING;

-- Auth identities
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES
('a1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','{"sub":"a1000000-0000-0000-0000-000000000011","email":"maria@demo.com"}'::jsonb,'email','maria@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000012','{"sub":"a1000000-0000-0000-0000-000000000012","email":"carlos@demo.com"}'::jsonb,'email','carlos@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','{"sub":"a1000000-0000-0000-0000-000000000013","email":"sofia@demo.com"}'::jsonb,'email','sofia@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000014','{"sub":"a1000000-0000-0000-0000-000000000014","email":"james@demo.com"}'::jsonb,'email','james@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000015','{"sub":"a1000000-0000-0000-0000-000000000015","email":"emma@demo.com"}'::jsonb,'email','emma@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000016','{"sub":"a1000000-0000-0000-0000-000000000016","email":"lucas@demo.com"}'::jsonb,'email','lucas@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000017','{"sub":"a1000000-0000-0000-0000-000000000017","email":"priya@demo.com"}'::jsonb,'email','priya@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000018','{"sub":"a1000000-0000-0000-0000-000000000018","email":"tyler@demo.com"}'::jsonb,'email','tyler@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000019','{"sub":"a1000000-0000-0000-0000-000000000019","email":"yuki@demo.com"}'::jsonb,'email','yuki@demo.com',now(),now(),now()),
('a1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000020','{"sub":"a1000000-0000-0000-0000-000000000020","email":"aisha@demo.com"}'::jsonb,'email','aisha@demo.com',now(),now(),now())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- Profiles
INSERT INTO profiles (id, full_name, username) VALUES
('a1000000-0000-0000-0000-000000000011','María García','maria_garcia'),
('a1000000-0000-0000-0000-000000000012','Carlos López','carlos_lopez'),
('a1000000-0000-0000-0000-000000000013','Sofía Rodríguez','sofia_rodriguez'),
('a1000000-0000-0000-0000-000000000014','James Wilson','james_wilson'),
('a1000000-0000-0000-0000-000000000015','Emma Chen','emma_chen'),
('a1000000-0000-0000-0000-000000000016','Lucas Martínez','lucas_martinez'),
('a1000000-0000-0000-0000-000000000017','Priya Sharma','priya_sharma'),
('a1000000-0000-0000-0000-000000000018','Tyler Brooks','tyler_brooks'),
('a1000000-0000-0000-0000-000000000019','Yuki Tanaka','yuki_tanaka'),
('a1000000-0000-0000-0000-000000000020','Aisha Okafor','aisha_okafor')
ON CONFLICT (id) DO NOTHING;

-- User roles
INSERT INTO user_roles (user_id, role) VALUES
('a1000000-0000-0000-0000-000000000011','student'),
('a1000000-0000-0000-0000-000000000012','student'),
('a1000000-0000-0000-0000-000000000013','student'),
('a1000000-0000-0000-0000-000000000014','student'),
('a1000000-0000-0000-0000-000000000015','student'),
('a1000000-0000-0000-0000-000000000016','student'),
('a1000000-0000-0000-0000-000000000017','student'),
('a1000000-0000-0000-0000-000000000018','student'),
('a1000000-0000-0000-0000-000000000019','student'),
('a1000000-0000-0000-0000-000000000020','student')
ON CONFLICT (user_id, role) DO NOTHING;

-- Tenant users — Default School (users 11-16)
INSERT INTO tenant_users (tenant_id, user_id, role, status) VALUES
('00000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','student','active'),
('00000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000012','student','active'),
('00000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000013','student','active'),
('00000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','student','active'),
('00000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000015','student','active'),
('00000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000016','student','active')
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Tenant users — Code Academy (users 17-20)
INSERT INTO tenant_users (tenant_id, user_id, role, status) VALUES
('00000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000017','student','active'),
('00000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000018','student','active'),
('00000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000019','student','active'),
('00000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000020','student','active')
ON CONFLICT (tenant_id, user_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. ADDITIONAL COURSES
-- ---------------------------------------------------------------------------

-- Default School: 3 more courses (1003-1005)
INSERT INTO courses (course_id, title, description, status, author_id, tenant_id, category_id)
OVERRIDING SYSTEM VALUE
VALUES
(1003, 'UX Design Fundamentals',
 'Learn user-centered design: wireframing, prototyping, usability testing, and design systems.',
 'published', 'a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 (SELECT id FROM course_categories WHERE name = 'Design' LIMIT 1)),
(1004, 'Data Science with Python',
 'From statistics to machine learning: NumPy, Pandas, scikit-learn, and real-world projects.',
 'published', 'a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 (SELECT id FROM course_categories WHERE name = 'Data Science' LIMIT 1)),
(1005, 'Business Strategy for Startups',
 'Market validation, financial modeling, pitch decks, and growth strategies for founders.',
 'published', 'a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 (SELECT id FROM course_categories WHERE name = 'Business' LIMIT 1))
ON CONFLICT (course_id) DO NOTHING;

-- Code Academy: 2 more courses (2003-2004)
INSERT INTO courses (course_id, title, description, status, author_id, tenant_id, category_id)
OVERRIDING SYSTEM VALUE
VALUES
(2003, 'JavaScript Mastery',
 'Advanced JavaScript: closures, async/await, design patterns, and building full-stack apps.',
 'published', 'a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002',
 (SELECT id FROM course_categories WHERE name = 'Programming' LIMIT 1)),
(2004, 'Machine Learning Fundamentals',
 'Supervised and unsupervised learning, neural networks, and model deployment with Python.',
 'published', 'a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002',
 (SELECT id FROM course_categories WHERE name = 'Data Science' LIMIT 1))
ON CONFLICT (course_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. ADDITIONAL LESSONS
-- ---------------------------------------------------------------------------

-- Default School — Course 1003 (UX Design)
INSERT INTO lessons (id, course_id, title, description, content, sequence, status, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(1004, 1003, 'Introduction to UX Design', 'What is UX and why it matters.',
 '# Introduction to UX Design\n\nUser Experience (UX) design focuses on creating products that provide meaningful experiences to users.\n\n## Key Principles\n- **Usability** — Can users accomplish their goals easily?\n- **Accessibility** — Can everyone use it, regardless of ability?\n- **Desirability** — Does it feel good to use?\n\n> "Design is not just what it looks like. Design is how it works." — Steve Jobs',
 1, 'published', '00000000-0000-0000-0000-000000000001'),
(1005, 1003, 'Wireframing Basics', 'Creating low-fidelity wireframes.',
 '# Wireframing Basics\n\nWireframes are simplified visual guides of a page layout.\n\n## Tools\n- Figma\n- Sketch\n- Balsamiq\n- Even pen and paper!\n\n## Best Practices\n1. Start with mobile-first\n2. Focus on layout, not aesthetics\n3. Use placeholder content\n4. Get feedback early',
 2, 'published', '00000000-0000-0000-0000-000000000001'),
(1006, 1003, 'Usability Testing', 'How to run effective usability tests.',
 '# Usability Testing\n\nUsability testing lets you observe real users interacting with your product.\n\n## Steps\n1. Define your goals\n2. Recruit 5-7 participants\n3. Create task scenarios\n4. Observe without leading\n5. Analyse patterns\n\n> "If you want a great site, you''ve got to test." — Steve Krug',
 3, 'published', '00000000-0000-0000-0000-000000000001'),

-- Default School — Course 1004 (Data Science)
(1007, 1004, 'Statistics Refresher', 'Mean, median, standard deviation, and distributions.',
 '# Statistics Refresher\n\n## Descriptive Statistics\n- **Mean** = sum / count\n- **Median** = middle value\n- **Mode** = most frequent value\n- **Standard deviation** = spread of data\n\n```python\nimport numpy as np\ndata = [23, 45, 12, 67, 34, 89, 21]\nprint(f"Mean: {np.mean(data):.1f}")\nprint(f"Std:  {np.std(data):.1f}")\n```',
 1, 'published', '00000000-0000-0000-0000-000000000001'),
(1008, 1004, 'NumPy Essentials', 'Arrays, broadcasting, and vectorized operations.',
 '# NumPy Essentials\n\n```python\nimport numpy as np\n\na = np.array([1, 2, 3, 4, 5])\nprint(a * 2)        # [2 4 6 8 10]\nprint(a.reshape(5,1) + a)  # broadcasting!\n```\n\nNumPy is **50x faster** than pure Python loops for numerical operations.',
 2, 'published', '00000000-0000-0000-0000-000000000001'),
(1009, 1004, 'Intro to scikit-learn', 'Your first ML model in 10 lines of code.',
 '# Intro to scikit-learn\n\n```python\nfrom sklearn.datasets import load_iris\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.ensemble import RandomForestClassifier\n\nX, y = load_iris(return_X_y=True)\nX_train, X_test, y_train, y_test = train_test_split(X, y)\nclf = RandomForestClassifier().fit(X_train, y_train)\nprint(f"Accuracy: {clf.score(X_test, y_test):.2%}")\n```',
 3, 'published', '00000000-0000-0000-0000-000000000001'),

-- Default School — Course 1005 (Business Strategy)
(1010, 1005, 'Market Validation', 'How to test your idea before building.',
 '# Market Validation\n\n## The Lean Approach\n1. **Problem interviews** — Talk to 20+ potential customers\n2. **Landing page test** — Measure sign-up conversion\n3. **Concierge MVP** — Deliver the service manually first\n4. **Smoke test** — Advertise before building\n\n> "Get out of the building!" — Steve Blank',
 1, 'published', '00000000-0000-0000-0000-000000000001'),
(1011, 1005, 'Financial Modeling', 'Build a 3-year financial forecast.',
 '# Financial Modeling\n\n## Key Components\n- **Revenue model** — How will you make money?\n- **Cost structure** — Fixed vs variable costs\n- **Unit economics** — CAC, LTV, payback period\n- **Cash flow** — Runway and burn rate\n\nA good model answers: "When do we become profitable?"',
 2, 'published', '00000000-0000-0000-0000-000000000001'),
(1012, 1005, 'Pitch Deck Essentials', 'Create a compelling investor pitch.',
 '# Pitch Deck Essentials\n\n## The 10-Slide Framework\n1. Cover\n2. Problem\n3. Solution\n4. Market size\n5. Business model\n6. Traction\n7. Team\n8. Competition\n9. Financials\n10. Ask\n\n> Keep each slide to ONE key message.',
 3, 'published', '00000000-0000-0000-0000-000000000001'),

-- Code Academy — Course 2003 (JavaScript Mastery)
(2004, 2003, 'Closures and Scope', 'Understanding lexical scope and closures.',
 '# Closures and Scope\n\n```javascript\nfunction counter() {\n  let count = 0;\n  return {\n    increment: () => ++count,\n    getCount: () => count\n  };\n}\n\nconst c = counter();\nc.increment();\nc.increment();\nconsole.log(c.getCount()); // 2\n```\n\nA closure "remembers" the variables from its outer scope.',
 1, 'published', '00000000-0000-0000-0000-000000000002'),
(2005, 2003, 'Async/Await Patterns', 'Mastering asynchronous JavaScript.',
 '# Async/Await Patterns\n\n```javascript\nasync function fetchUserData(userId) {\n  try {\n    const [user, posts] = await Promise.all([\n      fetch(`/api/users/${userId}`).then(r => r.json()),\n      fetch(`/api/users/${userId}/posts`).then(r => r.json())\n    ]);\n    return { user, posts };\n  } catch (err) {\n    console.error("Failed to fetch:", err);\n  }\n}\n```',
 2, 'published', '00000000-0000-0000-0000-000000000002'),
(2006, 2003, 'Design Patterns in JS', 'Observer, Factory, and Module patterns.',
 '# Design Patterns in JS\n\n## Observer Pattern\n```javascript\nclass EventBus {\n  #listeners = new Map();\n  on(event, fn) {\n    if (!this.#listeners.has(event)) this.#listeners.set(event, []);\n    this.#listeners.get(event).push(fn);\n  }\n  emit(event, data) {\n    this.#listeners.get(event)?.forEach(fn => fn(data));\n  }\n}\n```',
 3, 'published', '00000000-0000-0000-0000-000000000002'),

-- Code Academy — Course 2004 (Machine Learning)
(2007, 2004, 'What is Machine Learning?', 'Overview of supervised and unsupervised learning.',
 '# What is Machine Learning?\n\n## Types of ML\n- **Supervised** — Labeled data (classification, regression)\n- **Unsupervised** — No labels (clustering, dimensionality reduction)\n- **Reinforcement** — Learning from rewards\n\nML is about finding patterns in data that humans can''t easily see.',
 1, 'published', '00000000-0000-0000-0000-000000000002'),
(2008, 2004, 'Linear Regression Deep Dive', 'The math and code behind linear regression.',
 '# Linear Regression\n\n```python\nimport numpy as np\nfrom sklearn.linear_model import LinearRegression\n\nX = np.array([[1],[2],[3],[4],[5]])\ny = np.array([2.1, 4.0, 5.8, 8.1, 9.9])\n\nmodel = LinearRegression().fit(X, y)\nprint(f"Slope: {model.coef_[0]:.2f}")  # ~2.0\nprint(f"Intercept: {model.intercept_:.2f}")  # ~0.1\n```',
 2, 'published', '00000000-0000-0000-0000-000000000002'),
(2009, 2004, 'Neural Networks Intro', 'Build your first neural network with TensorFlow.',
 '# Neural Networks\n\n```python\nimport tensorflow as tf\n\nmodel = tf.keras.Sequential([\n  tf.keras.layers.Dense(64, activation="relu"),\n  tf.keras.layers.Dense(32, activation="relu"),\n  tf.keras.layers.Dense(1, activation="sigmoid")\n])\nmodel.compile(optimizer="adam", loss="binary_crossentropy")\n```\n\nNeural networks learn by adjusting weights through backpropagation.',
 3, 'published', '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. ADDITIONAL PRODUCTS
-- ---------------------------------------------------------------------------
INSERT INTO products (product_id, name, description, price, currency, status, payment_provider, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(1003, 'UX Design Bootcamp',
 'Complete UX Design course with wireframing and usability testing.',
 39.00, 'usd', 'active', 'stripe', '00000000-0000-0000-0000-000000000001'),
(1004, 'Data Science Bundle',
 'Statistics, NumPy, and scikit-learn — everything to start your data career.',
 49.00, 'usd', 'active', 'stripe', '00000000-0000-0000-0000-000000000001'),
(2003, 'JavaScript Pro Pack',
 'Advanced JavaScript: closures, async patterns, and design patterns.',
 39.00, 'usd', 'active', 'stripe', '00000000-0000-0000-0000-000000000002')
ON CONFLICT (product_id) DO NOTHING;

-- Product → Course links
INSERT INTO product_courses (product_id, course_id, tenant_id) VALUES
(1003, 1003, '00000000-0000-0000-0000-000000000001'),
(1004, 1004, '00000000-0000-0000-0000-000000000001'),
(2003, 2003, '00000000-0000-0000-0000-000000000002')
ON CONFLICT (product_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. ENROLLMENTS for fake students
-- ---------------------------------------------------------------------------
INSERT INTO enrollments (enrollment_id, user_id, course_id, product_id, status, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
-- Default School students
(1003,'a1000000-0000-0000-0000-000000000011',1001,1001,'active','00000000-0000-0000-0000-000000000001'),
(1004,'a1000000-0000-0000-0000-000000000011',1003,1003,'active','00000000-0000-0000-0000-000000000001'),
(1005,'a1000000-0000-0000-0000-000000000012',1001,1001,'active','00000000-0000-0000-0000-000000000001'),
(1006,'a1000000-0000-0000-0000-000000000012',1002,1002,'active','00000000-0000-0000-0000-000000000001'),
(1007,'a1000000-0000-0000-0000-000000000013',1003,1003,'active','00000000-0000-0000-0000-000000000001'),
(1008,'a1000000-0000-0000-0000-000000000013',1004,1004,'active','00000000-0000-0000-0000-000000000001'),
(1009,'a1000000-0000-0000-0000-000000000014',1001,1001,'active','00000000-0000-0000-0000-000000000001'),
(1010,'a1000000-0000-0000-0000-000000000014',1005,1002,'active','00000000-0000-0000-0000-000000000001'),
(1011,'a1000000-0000-0000-0000-000000000015',1002,1002,'active','00000000-0000-0000-0000-000000000001'),
(1012,'a1000000-0000-0000-0000-000000000015',1004,1004,'active','00000000-0000-0000-0000-000000000001'),
(1013,'a1000000-0000-0000-0000-000000000016',1003,1003,'active','00000000-0000-0000-0000-000000000001'),
-- Also enroll existing test student in new courses
(1014,'a1000000-0000-0000-0000-000000000001',1003,1003,'active','00000000-0000-0000-0000-000000000001'),

-- Code Academy students
(2003,'a1000000-0000-0000-0000-000000000017',2001,2001,'active','00000000-0000-0000-0000-000000000002'),
(2004,'a1000000-0000-0000-0000-000000000017',2003,2003,'active','00000000-0000-0000-0000-000000000002'),
(2005,'a1000000-0000-0000-0000-000000000018',2001,2001,'active','00000000-0000-0000-0000-000000000002'),
(2006,'a1000000-0000-0000-0000-000000000018',2002,2001,'active','00000000-0000-0000-0000-000000000002'),
(2007,'a1000000-0000-0000-0000-000000000019',2003,2003,'active','00000000-0000-0000-0000-000000000002'),
(2008,'a1000000-0000-0000-0000-000000000020',2001,2001,'active','00000000-0000-0000-0000-000000000002'),
(2009,'a1000000-0000-0000-0000-000000000020',2004,2003,'active','00000000-0000-0000-0000-000000000002'),
-- Also enroll Alice in new courses
(2010,'a1000000-0000-0000-0000-000000000004',2003,2003,'active','00000000-0000-0000-0000-000000000002')
ON CONFLICT (enrollment_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 6. TRANSACTIONS — Default School (~15 over last 30 days)
-- ---------------------------------------------------------------------------
INSERT INTO transactions (transaction_id, user_id, product_id, amount, transaction_date, payment_method, status, currency, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(1001,'a1000000-0000-0000-0000-000000000011',1001,29.00, now()-interval '28 days','stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1002,'a1000000-0000-0000-0000-000000000011',1003,39.00, now()-interval '27 days','stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1003,'a1000000-0000-0000-0000-000000000012',1001,29.00, now()-interval '25 days','stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1004,'a1000000-0000-0000-0000-000000000012',1002, 0.00, now()-interval '25 days','manual','successful','usd','00000000-0000-0000-0000-000000000001'),
(1005,'a1000000-0000-0000-0000-000000000013',1003,39.00, now()-interval '22 days','stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1006,'a1000000-0000-0000-0000-000000000013',1004,49.00, now()-interval '20 days','stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1007,'a1000000-0000-0000-0000-000000000014',1001,29.00, now()-interval '18 days','stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1008,'a1000000-0000-0000-0000-000000000014',1002, 0.00, now()-interval '15 days','manual','successful','usd','00000000-0000-0000-0000-000000000001'),
(1009,'a1000000-0000-0000-0000-000000000015',1002, 0.00, now()-interval '13 days','manual','successful','usd','00000000-0000-0000-0000-000000000001'),
(1010,'a1000000-0000-0000-0000-000000000015',1004,49.00, now()-interval '10 days','stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1011,'a1000000-0000-0000-0000-000000000016',1003,39.00, now()-interval '8 days', 'stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
(1012,'a1000000-0000-0000-0000-000000000001',1003,39.00, now()-interval '5 days', 'stripe','successful','usd','00000000-0000-0000-0000-000000000001'),
-- A couple pending/failed for variety
(1013,'a1000000-0000-0000-0000-000000000016',1004,49.00, now()-interval '3 days', 'stripe','pending', 'usd','00000000-0000-0000-0000-000000000001'),
(1014,'a1000000-0000-0000-0000-000000000014',1004,49.00, now()-interval '2 days', 'stripe','failed',  'usd','00000000-0000-0000-0000-000000000001'),
(1015,'a1000000-0000-0000-0000-000000000015',1003,39.00, now()-interval '1 day',  'stripe','successful','usd','00000000-0000-0000-0000-000000000001')
ON CONFLICT (transaction_id) DO NOTHING;

-- Code Academy transactions (~10)
INSERT INTO transactions (transaction_id, user_id, product_id, amount, transaction_date, payment_method, status, currency, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(2001,'a1000000-0000-0000-0000-000000000017',2001,49.00, now()-interval '30 days','stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2002,'a1000000-0000-0000-0000-000000000017',2003,39.00, now()-interval '28 days','stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2003,'a1000000-0000-0000-0000-000000000018',2001,49.00, now()-interval '25 days','stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2004,'a1000000-0000-0000-0000-000000000018',2001,49.00, now()-interval '22 days','stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2005,'a1000000-0000-0000-0000-000000000019',2003,39.00, now()-interval '18 days','stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2006,'a1000000-0000-0000-0000-000000000020',2001,49.00, now()-interval '15 days','stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2007,'a1000000-0000-0000-0000-000000000020',2003,39.00, now()-interval '12 days','stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2008,'a1000000-0000-0000-0000-000000000004',2003,39.00, now()-interval '8 days', 'stripe','successful','usd','00000000-0000-0000-0000-000000000002'),
(2009,'a1000000-0000-0000-0000-000000000019',2001,49.00, now()-interval '5 days', 'stripe','pending', 'usd','00000000-0000-0000-0000-000000000002'),
(2010,'a1000000-0000-0000-0000-000000000004',2001,49.00, now()-interval '2 days', 'stripe','successful','usd','00000000-0000-0000-0000-000000000002')
ON CONFLICT (transaction_id) DO NOTHING;

SELECT setval('transactions_transaction_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 7. LESSON COMPLETIONS (no tenant_id column)
-- The handle_lesson_completion_xp trigger expects NEW.tenant_id which doesn't
-- exist on this table — disable it for seeding, then re-enable.
-- ---------------------------------------------------------------------------
ALTER TABLE lesson_completions DISABLE TRIGGER on_lesson_completed_xp;
ALTER TABLE lesson_completions DISABLE TRIGGER trigger_auto_issue_on_lesson_completion;

-- Test student (student@e2etest.com) — 3 of 5 lessons completed
INSERT INTO lesson_completions (user_id, lesson_id, completed_at) VALUES
('a1000000-0000-0000-0000-000000000001', 1001, now()-interval '20 days'),
('a1000000-0000-0000-0000-000000000001', 1002, now()-interval '18 days'),
('a1000000-0000-0000-0000-000000000001', 1003, now()-interval '15 days')
ON CONFLICT DO NOTHING;

-- María — 2 lessons
INSERT INTO lesson_completions (user_id, lesson_id, completed_at) VALUES
('a1000000-0000-0000-0000-000000000011', 1001, now()-interval '25 days'),
('a1000000-0000-0000-0000-000000000011', 1002, now()-interval '22 days')
ON CONFLICT DO NOTHING;

-- Carlos — 1 lesson
INSERT INTO lesson_completions (user_id, lesson_id, completed_at) VALUES
('a1000000-0000-0000-0000-000000000012', 1001, now()-interval '20 days')
ON CONFLICT DO NOTHING;

-- Sofía — 3 lessons
INSERT INTO lesson_completions (user_id, lesson_id, completed_at) VALUES
('a1000000-0000-0000-0000-000000000013', 1004, now()-interval '18 days'),
('a1000000-0000-0000-0000-000000000013', 1005, now()-interval '15 days'),
('a1000000-0000-0000-0000-000000000013', 1006, now()-interval '12 days')
ON CONFLICT DO NOTHING;

-- Alice (Code Academy) — 2 of 3 lessons
INSERT INTO lesson_completions (user_id, lesson_id, completed_at) VALUES
('a1000000-0000-0000-0000-000000000004', 2001, now()-interval '15 days'),
('a1000000-0000-0000-0000-000000000004', 2002, now()-interval '12 days')
ON CONFLICT DO NOTHING;

-- Priya (Code Academy) — 2 lessons
INSERT INTO lesson_completions (user_id, lesson_id, completed_at) VALUES
('a1000000-0000-0000-0000-000000000017', 2001, now()-interval '28 days'),
('a1000000-0000-0000-0000-000000000017', 2002, now()-interval '25 days')
ON CONFLICT DO NOTHING;

-- Tyler (Code Academy) — 1 lesson
INSERT INTO lesson_completions (user_id, lesson_id, completed_at) VALUES
('a1000000-0000-0000-0000-000000000018', 2001, now()-interval '22 days')
ON CONFLICT DO NOTHING;

ALTER TABLE lesson_completions ENABLE TRIGGER on_lesson_completed_xp;
ALTER TABLE lesson_completions ENABLE TRIGGER trigger_auto_issue_on_lesson_completion;


-- ---------------------------------------------------------------------------
-- 8. EXAMS
-- ---------------------------------------------------------------------------
INSERT INTO exams (exam_id, course_id, title, description, exam_date, duration, status, created_by, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
-- Default School
(1001, 1001, 'Testing Fundamentals Quiz', 'Test your knowledge of software testing concepts.', now()-interval '10 days', 30, 'published', 'a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
(1002, 1002, 'HTML & CSS Quiz', 'Evaluate your web development basics.', now()-interval '8 days', 25, 'published', 'a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
(1003, 1003, 'UX Design Assessment', 'Test your understanding of UX principles.', now()-interval '5 days', 30, 'published', 'a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
(1004, 1004, 'Data Science Midterm', 'Statistics and NumPy fundamentals.', now()-interval '3 days', 45, 'published', 'a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),

-- Code Academy
(2001, 2001, 'Python Basics Exam', 'Variables, types, and control flow.', now()-interval '12 days', 30, 'published', 'a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002'),
(2002, 2003, 'JavaScript Advanced Quiz', 'Closures, async patterns, and design patterns.', now()-interval '6 days', 35, 'published', 'a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002'),
(2003, 2004, 'ML Fundamentals Test', 'Supervised learning and regression.', now()-interval '2 days', 40, 'published', 'a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002')
ON CONFLICT (exam_id) DO NOTHING;

SELECT setval('exams_exam_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 9. EXAM SUBMISSIONS
-- ---------------------------------------------------------------------------
INSERT INTO exam_submissions (submission_id, exam_id, student_id, submission_date, score, feedback, review_status, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
-- Default School
(1001, 1001, 'a1000000-0000-0000-0000-000000000001', now()-interval '9 days', 85.0, 'Good understanding of testing concepts.', 'graded', '00000000-0000-0000-0000-000000000001'),
(1002, 1001, 'a1000000-0000-0000-0000-000000000011', now()-interval '8 days', 92.0, 'Excellent work!', 'graded', '00000000-0000-0000-0000-000000000001'),
(1003, 1002, 'a1000000-0000-0000-0000-000000000012', now()-interval '7 days', 78.0, 'Review CSS selectors.', 'graded', '00000000-0000-0000-0000-000000000001'),
(1004, 1003, 'a1000000-0000-0000-0000-000000000013', now()-interval '4 days', 95.0, 'Outstanding UX knowledge!', 'graded', '00000000-0000-0000-0000-000000000001'),

-- Code Academy
(2001, 2001, 'a1000000-0000-0000-0000-000000000004', now()-interval '10 days', 88.0, 'Strong Python fundamentals.', 'graded', '00000000-0000-0000-0000-000000000002'),
(2002, 2001, 'a1000000-0000-0000-0000-000000000017', now()-interval '9 days', 91.0, 'Great job on control flow!', 'graded', '00000000-0000-0000-0000-000000000002'),
(2003, 2002, 'a1000000-0000-0000-0000-000000000004', now()-interval '5 days', 82.0, 'Review async patterns.', 'graded', '00000000-0000-0000-0000-000000000002')
ON CONFLICT (submission_id) DO NOTHING;

SELECT setval('exam_submissions_submission_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 10. GAMIFICATION XP TRANSACTIONS
-- ---------------------------------------------------------------------------

-- Test student (Default School)
INSERT INTO gamification_xp_transactions (id, user_id, action_type, xp_amount, reference_id, reference_type, created_at, tenant_id) VALUES
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'lesson_completed', 50, '1001', 'lesson', now()-interval '20 days', '00000000-0000-0000-0000-000000000001'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'lesson_completed', 50, '1002', 'lesson', now()-interval '18 days', '00000000-0000-0000-0000-000000000001'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'lesson_completed', 50, '1003', 'lesson', now()-interval '15 days', '00000000-0000-0000-0000-000000000001'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'exam_submitted',  100, '1001', 'exam',   now()-interval '9 days',  '00000000-0000-0000-0000-000000000001'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'achievement_earned', 50, 'first_lesson', 'achievement', now()-interval '20 days', '00000000-0000-0000-0000-000000000001'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'daily_login',     10, NULL, 'login',  now()-interval '1 day',   '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Alice (Code Academy)
INSERT INTO gamification_xp_transactions (id, user_id, action_type, xp_amount, reference_id, reference_type, created_at, tenant_id) VALUES
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', 'lesson_completed', 50, '2001', 'lesson', now()-interval '15 days', '00000000-0000-0000-0000-000000000002'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', 'lesson_completed', 50, '2002', 'lesson', now()-interval '12 days', '00000000-0000-0000-0000-000000000002'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', 'exam_submitted',  100, '2001', 'exam',   now()-interval '10 days', '00000000-0000-0000-0000-000000000002'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', 'achievement_earned', 50, 'first_lesson', 'achievement', now()-interval '15 days', '00000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- Update gamification profiles XP to match
UPDATE gamification_profiles SET total_xp = 310, level = 3 WHERE user_id = 'a1000000-0000-0000-0000-000000000001' AND tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE gamification_profiles SET total_xp = 250, level = 3 WHERE user_id = 'a1000000-0000-0000-0000-000000000004' AND tenant_id = '00000000-0000-0000-0000-000000000002';


-- ---------------------------------------------------------------------------
-- 11. USER ACHIEVEMENTS
-- ---------------------------------------------------------------------------
INSERT INTO gamification_user_achievements (id, user_id, achievement_id, earned_at, tenant_id) VALUES
-- Test student — "First Steps" + "Voice of Reason"
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001',
 (SELECT id FROM gamification_achievements WHERE slug = 'first_lesson'),
 now()-interval '20 days', '00000000-0000-0000-0000-000000000001'),
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001',
 (SELECT id FROM gamification_achievements WHERE slug = 'vocal_student'),
 now()-interval '10 days', '00000000-0000-0000-0000-000000000001'),

-- Alice — "First Steps"
(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004',
 (SELECT id FROM gamification_achievements WHERE slug = 'first_lesson'),
 now()-interval '15 days', '00000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 12. GAMIFICATION PROFILES for new students
-- ---------------------------------------------------------------------------
INSERT INTO gamification_profiles (user_id, total_xp, level, current_streak, tenant_id) VALUES
('a1000000-0000-0000-0000-000000000011', 150, 2, 3, '00000000-0000-0000-0000-000000000001'),
('a1000000-0000-0000-0000-000000000012', 80,  1, 1, '00000000-0000-0000-0000-000000000001'),
('a1000000-0000-0000-0000-000000000013', 200, 2, 5, '00000000-0000-0000-0000-000000000001'),
('a1000000-0000-0000-0000-000000000017', 180, 2, 4, '00000000-0000-0000-0000-000000000002'),
('a1000000-0000-0000-0000-000000000018', 60,  1, 1, '00000000-0000-0000-0000-000000000002')
ON CONFLICT (user_id, tenant_id) DO NOTHING;


-- Done! 🎬
SELECT 'Demo seed data applied successfully' AS status;
