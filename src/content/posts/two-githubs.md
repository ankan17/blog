---
title: "One laptop, two GitHubs, zero identity crises"
description: "Getting gh, git and SSH to agree on who you are, by letting the folder decide."
date: 2026-11-19
tags: ["git", "github", "ssh", "direnv"]
draft: true
---

The last time I blogged, I was 18 and explaining two's complement to classmates on Learn C With Me. Nine years and a stint as an engineering manager later, I'm back, writing up the systems I build and the small fixes that save me hours. This is the first one.

You have a personal GitHub account, a work one, and a single laptop that cannot tell them apart. Worse, `gh`, `git` and SSH each decide who you are on their own, like three coworkers who never compared notes. This post gets all three to agree that anything under `~/Projects/work` is Work You and everything else is Weekend You. No switching commands, no remembering.

## How it goes wrong

It comes in three flavors. `gh pr create` opens a pull request on a work repo as your personal account, which is a fun surprise for reviewers. `git push` is rejected because the SSH key belongs to the other you. And the worst one: a commit sails through with your personal email, and you only find out when a colleague asks who that is.

The standard advice is `gh auth switch`. It works the way a light switch works: you have to remember to flip it, and you will forget exactly once, at 5:58 pm on a Friday. We want the folder to decide instead.

## Three layers, zero communication

One `git push` followed by one `gh pr create` quietly consults three separate identity systems. They don't talk to each other, and each is configured in a different place. This is the whole mystery, and the table below is the cheat sheet.

| Layer | Question it answers | Who reads it | Controlled by |
| --- | --- | --- | --- |
| GitHub API | Which account do `gh` commands act as? | `gh` CLI | `GH_TOKEN` env var, else the active account in the `gh` keyring |
| Git transport | Which credentials open the connection to GitHub? | `git` over SSH | `core.sshCommand` (which SSH key) |
| Commit identity | Whose name and email are on the commit? | `git commit` | `user.name` and `user.email` |

The plan is to make the folder you're standing in the single input to all three. direnv takes care of the first layer, and a git `includeIf` rule takes care of the other two.

## Introduce both of your selves to gh

Recent versions of `gh` can hold several logins at once. Run the login flow twice, signing in to the matching GitHub account in the browser each time. Look at which account the browser tab is signed in to before you click Authorize. Authorizing the wrong one twice in a row is a rite of passage.

```sh
gh auth login   # personal account
gh auth login   # work account
```

Both credentials land in your OS keyring, and exactly one is marked active. Ask `gh` who's home:

```sh
gh auth status
```

The output lists each account, whether it's active, the git protocol (`https` or `ssh`) and the token scopes. Two details matter later:

- **The active account is the default.** Anything outside your work folder keeps using it, so make your personal account the active one with `gh auth switch --user PERSONAL_USER`.
- **The protocol is a clue for the SSH step below.** If it says `ssh`, then `git push` uses your SSH keys and `gh`'s token plays no part in it. Yes, that means `gh` is only one third of the problem.

## Hire direnv as your bouncer

`gh` checks the `GH_TOKEN` environment variable before it looks at anything in its keyring. So a `GH_TOKEN` that exists only inside your work folder overrides the active account exactly where you want it to, and nowhere else. `gh auth token --user NAME` prints a stored token, so no secret is ever written to a file.

Install direnv and plug it into zsh:

```sh
brew install direnv
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc && source ~/.zshrc
```

That hook makes zsh peek for a `.envrc` file every time you `cd`, load it if there is one, and unload it when you leave. Skip the hook and direnv sits there installed and idle, doing nothing, with great confidence.

Now plant the override in your work folder and approve it:

```sh
echo 'export GH_TOKEN=$(gh auth token --user WORK_USER)' > ~/Projects/work/.envrc
direnv allow ~/Projects/work
```

`direnv allow` is the bouncer checking your list. direnv refuses to run a `.envrc` you haven't approved, so a stranger's repo can't execute code on your machine just by containing one. The approval covers every subfolder too, because direnv walks upward from where you stand until it finds a `.envrc`.

Allergic to installing things? A `chpwd` hook in `~/.zshrc` does the same job:

```zsh
chpwd() {
  case $PWD in
    $HOME/Projects/work|$HOME/Projects/work/*) export GH_TOKEN=$(gh auth token --user WORK_USER) ;;
    *) unset GH_TOKEN ;;
  esac
}
```

The trade-off: it runs `gh` on every matching `cd`, and it lives in your shell config instead of next to the project. It works. It's just less tidy, and it only fires when you change directory: a terminal that opens straight into a work repo, like an editor's built-in one, stays personal until you move.

## A second SSH key, because GitHub doesn't share

GitHub identifies you over SSH by the key you present, and one key can belong to only one account. There is no negotiating with this rule. Your work account needs a key of its own.

```sh
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519.work -C work
```

Add the public half (`~/.ssh/id_ed25519.work.pub`) at [github.com/settings/keys](https://github.com/settings/keys) while signed in as the work account. Uploading through the CLI needs the `admin:public_key` token scope, which a default `gh` login may not have, so the browser is the path of least resistance.

Then ask GitHub who it thinks you are:

```sh
ssh -i ~/.ssh/id_ed25519.work -o IdentitiesOnly=yes -T git@github.com
```

You want to see this:

```text
Hi WORK_USER! You've successfully authenticated, but GitHub does not provide shell access.
```

A friendly refusal. Shell access was never on the menu. The `IdentitiesOnly=yes` option is doing real work here. Without it, SSH offers every key in your agent, and GitHub accepts the first one it recognises, which may well be your personal one. With it, only the key named by `-i` is offered, so the answer is the same every time.

## Teach git some manners with includeIf

Git can load extra config only when a repository lives under a given path, which is exactly the trick we need. Add one rule to `~/.gitconfig`:

```ini
[includeIf "gitdir:~/Projects/work/"]
  path = ~/.gitconfig-work
```

Then put everything work-specific in `~/.gitconfig-work`:

```ini
[user]
  name = Your Name
  email = you@your-company.com
[core]
  sshCommand = ssh -i ~/.ssh/id_ed25519.work -o IdentitiesOnly=yes
```

Inside any repo under `~/Projects/work/`, git now commits with your work email and runs every fetch and push with the work key. Everywhere else it falls back to your normal `~/.gitconfig` and default key. Nobody has to be told.

That trailing slash in `gitdir:~/Projects/work/` is load-bearing. With it, git matches every repo beneath the folder. Without it, git looks for a `.git` directory at exactly that path, finds none, and never loads your work config. No error, no warning, just personal commits.

## Trust, but verify (three times)

Check all three layers, because each one can fail while the other two smugly succeed.

```sh
# Layer 1: which account does gh act as?
cd ~/Projects/work     && gh api user -q .login   # WORK_USER
cd ~/Projects/personal && gh api user -q .login   # PERSONAL_USER

# Layer 2: does git use the right SSH key?
cd ~/Projects/work/some-repo && git ls-remote origin HEAD
git config core.sshCommand                         # shows the work key

# Layer 3: whose email goes on commits?
cd ~/Projects/work/some-repo && git config user.email
cd ~/Projects/personal       && git config user.email
```

Use `gh api user -q .login` for layer 1 rather than `gh auth status`. The status command lists stored accounts and doesn't necessarily show the `GH_TOKEN` override as active, so it can look wrong when the setup is right.

## Gotchas

- **A nested `.envrc` hides its parent's.** direnv uses only the nearest `.envrc`. If a repo inside your work folder has its own, start it with `source_up` so it inherits the work `GH_TOKEN` instead of staging a coup.
- **Worktrees outside the folder end up half personal.** `includeIf` matches the repo's `.git` directory, and a worktree's stays inside the main repo, so commits and pushes keep the work identity. direnv goes by the folder you're in, so `gh` falls back to personal. Keep worktrees under the work folder.
- **Tools inherit the environment of whatever launched them.** Start editors, agents and scripts from a terminal inside the work folder and they pick up `GH_TOKEN`. Launch them from the Dock and they will cheerfully be personal.
- **`GH_TOKEN` beats stored logins everywhere in that shell.** That's the point, but it also means `gh auth switch` seems to do nothing inside the work folder. Unset the variable if you need to test.
- **Token scopes differ per account.** If a command fails for the work account only, compare the scopes in `gh auth status`, then add one with `gh auth refresh -s SCOPE`.
- **The key follows the folder, not the URL.** A repo cloned over HTTPS ignores `core.sshCommand` entirely. Convert it with `git remote set-url origin git@github.com:ORG/REPO.git`.

## The whole thing, on one napkin

Four small pieces, and not one of them needs a command at the moment you work.

| Piece | Where it lives | What it controls |
| --- | --- | --- |
| Two `gh` logins | OS keyring | Available accounts; personal stays active |
| `GH_TOKEN` line | `~/Projects/work/.envrc` | `gh` acts as the work account in that folder |
| Work SSH key | `~/.ssh/id_ed25519.work` | Authenticates pushes and pulls as the work account |
| `includeIf` rule | `~/.gitconfig` and `~/.gitconfig-work` | Work SSH key plus name and email under the work folder |

The design principle is to let the path decide. direnv and `includeIf` both key off where you're standing, so you get the right identity by default and have nothing to switch back. Your future self, at 5:58 pm on a Friday, says thanks.

That's the first one back. More build logs and fixes like this are on the way, so subscribe if you want them in your inbox.
