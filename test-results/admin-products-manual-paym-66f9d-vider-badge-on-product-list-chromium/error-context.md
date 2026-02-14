# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]: Login
      - generic [ref=e8]: Enter your email below to login to your account
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Email
          - textbox "Email" [ref=e14]:
            - /placeholder: m@example.com
        - generic [ref=e15]:
          - generic [ref=e16]:
            - generic [ref=e17]: Password
            - link "Forgot your password?" [ref=e18] [cursor=pointer]:
              - /url: /auth/forgot-password
          - textbox "Password" [ref=e19]
        - button "Login" [ref=e20]
      - generic [ref=e21]:
        - text: Don't have an account?
        - link "Sign up" [ref=e22] [cursor=pointer]:
          - /url: /auth/sign-up
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e28] [cursor=pointer]:
    - img [ref=e29]
  - alert [ref=e32]
```