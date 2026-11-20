---
title: "Design fixture (not a post)"
description: "A dense, synthetic post used to check the design. It never ships."
date: 2026-11-18
tags: ["git", "ssh"]
draft: true
---

## The problem

You have a work GitHub and a personal one. You add a second SSH key, run `git push`, and GitHub tells you the repository doesn't exist. It exists. It just doesn't exist for the account your laptop decided you are. This is the fixture, so the story is invented, but the *shape* is real: [a link to the docs](https://docs.github.com), some **strong** text, and enough prose to wrap a few lines at the reading measure.

### Why one key per account isn't enough

One key per account, right? Wrong. SSH offers every key it has, in order, and GitHub accepts the first that matches any account.

```sh
ssh -T git@github.com
```

```text
Hi ankan-work! You've successfully authenticated, but GitHub
does not provide shell access.
```

> A quiet blockquote. It is indented and soft, with no side bar, because the page already has enough rules.

### What the agent offers

Ask the agent what it holds, then count the keys against the limit.

```sh
ssh-add -l
```

```text
256 SHA256:Qm3n0vC6u1gH2ZsJk8bJd9o0sB1q7P2n4n6Yd0f5k3A work (ED25519)
256 SHA256:aT7yqk2Wn1k0R9xj5B8u3hQ0cZ7m4Vd2Lp6eF1s8gNo personal (ED25519)
```

## One host, two identities

The fix is to give each account its own host alias, so SSH stops guessing. Put the aliases in `~/.ssh/config` and tell SSH to offer *only* the named key with `IdentitiesOnly yes`.

```ssh-config
# ~/.ssh/config
Host github-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_work
  IdentitiesOnly yes

Host github-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes
```

Then clone with the alias instead of `github.com`:

```sh
git clone git@github-personal:ankan17/blog.git ~/Projects/personal/blog
```

Here is what each setting does:

| Setting | Effect |
|---|---|
| `Host` | The alias you type in the remote URL |
| `HostName` | The real server SSH connects to |
| `IdentityFile` | The key to offer |
| `IdentitiesOnly` | Offer that key and nothing else |

### Checking it worked

1. Run `ssh -T git@github-personal`.
2. Read the greeting: it names the account.
3. Repeat for the work alias.

## One identity per directory

Aliases fix authentication. They do not fix *authorship*: commits still carry whatever `user.email` says. Git can switch config by directory with `includeIf`.

```ini
# ~/.gitconfig
[user]
  name = Ankan Poddar
  email = ankan@work.example

[includeIf "gitdir:~/Projects/personal/"]
  path = ~/.gitconfig-personal
```

```ini
# ~/.gitconfig-personal
[user]
  email = ankan@personal.example
[url "git@github-personal:"]
  insteadOf = git@github.com:
```

A very long single line, to check that code scrolls inside its well instead of pushing the page sideways:

```sh
curl -fsSL -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" "https://api.github.com/repos/ankan17/blog/pulls?state=open&head=ankan17:draft/design-fixture&per_page=100" | jq '.[] | {number, title, html_url}'
```

- An unordered item with `inline code` in it.
- Another item that is long enough to wrap onto a second line so the hanging indent can be judged properly.
- A third.

## Where each tool looks

This is the comparison the whole post leans on. On a phone, the wide table must scroll inside its well.

| Tool | Reads | Scope | Wins when | Override | Gotcha |
|---|---|---|---|---|---|
| `ssh` | `~/.ssh/config` | per host | the alias matches | `-i key -o IdentitiesOnly=yes` | agent keys are offered first |
| `git` | `~/.gitconfig` | per directory | `gitdir:` matches | `git -c user.email=…` | trailing slash is required |
| `gh` | `~/.config/gh/hosts.yml` | per host | logged in | `GH_TOKEN` | one active account per host |
| `gpg` | `~/.gnupg` | per key | `user.signingkey` is set | `-u keyid` | key email must match |

---

That is the end of the fixture. If you can read this far with no horizontal scroll on the page itself, the layout is doing its job.
