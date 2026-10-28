# Deploying xrpddatavis with login

With `auth.enabled: true` (the default), the chart puts the app behind
Keycloak login the same way Diamond's other web apps do (Atlas's `ui-base`
chart and BlueAPI):

```
browser ──▶ ingress ──▶ oauth2-proxy ──▶ xrpddatavis
                          │    ▲
                 no session?   │ adds "Authorization: Bearer <access token>"
                          ▼    │ to every request it forwards
                     Keycloak login
```

- **oauth2-proxy** (a sub-chart) holds the Keycloak client secret, sends anyone
  without a session to Keycloak to log in, keeps them logged in with a cookie,
  and forwards their requests to the app with their access token attached.
- **The app** never sees the client secret. It checks each access token's
  signature against Keycloak's public keys, along with its issuer, audience
  and expiry (`src/xrpddatavis/auth/oidc.py`). It then makes the user's
  `fedid` available to endpoints.

Only `POST /plot`, `GET /healthz` and the page shell (`/`, `/static`) are
reachable without logging in, so any script can send plots. Everything else
returns `401` without a token.

## One-off setup per deployment

You need `kubectl` access to the target namespace, plus
[`kubeseal`](https://github.com/bitnami-labs/sealed-secrets#kubeseal).

### 1. Pick the hostname

For example `i11-datavis.diamond.ac.uk`. Users will visit this address, and
Keycloak needs it in step 2.

### 2. Request a Keycloak client

Ask for a client in the realm you will log in against (`auth.issuer`,
`https://identity.diamond.ac.uk/realms/dls` by default):

| Setting | Value |
| --- | --- |
| Client type | OpenID Connect, **confidential** (client authentication on) |
| Flow | Standard flow (authorization code) |
| Valid redirect URI | `https://<your host>/oauth2/callback` |
| OAuth 2.0 Device Authorization Grant | enabled, to get a real token for testing locally (see the main README, "Authentication") |
| Web origins | `https://<your host>` |
| Scopes | the same as Atlas: `openid email profile offline_access posix-uid`, plus the realm's `fedid` client scope as a **default** scope, so access tokens carry the `fedid` claim |
| Audience mapper (recommended) | adds the client ID to the access token's `aud` |

You get back a **client ID** and a **client secret**.

### 3. Make a cookie secret

oauth2-proxy encrypts its session cookie with this. It's a random value you
generate yourself:

```bash
openssl rand -base64 32 | tr -- '+/' '-_'
```

### 4. Seal the three values

A SealedSecret is safe to commit: `kubeseal` encrypts each value with the
cluster's public key, and only the sealed-secrets controller running in that
cluster can decrypt it. The encryption is tied to the **namespace** and the
**secret name**, so both must match where you deploy. The secret name is
`oauth2-proxy.config.existingSecret` in `values.yaml`
(`xrpddatavis-keycloak-secret`).

```bash
NS=<your namespace>
NAME=xrpddatavis-keycloak-secret

echo -n '<client id>'     | kubeseal --raw --namespace $NS --name $NAME
echo -n '<client secret>' | kubeseal --raw --namespace $NS --name $NAME
echo -n '<cookie secret>' | kubeseal --raw --namespace $NS --name $NAME
```

Use `echo -n` so no trailing newline gets encrypted with the value. If
`kubeseal` can't find the controller, check which namespace your cluster runs
it in and pass `--controller-namespace` / `--controller-name`.

Paste each output (a long string starting `Ag...`) into
`templates/keycloak_secret.yaml`:

```yaml
  encryptedData:
    client-id: AgB...
    client-secret: AgC...
    cookie-secret: AgD...
```

Never commit the plain values.

### 5. Set the values

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: i11-datavis.diamond.ac.uk
      paths:
        - path: /
          pathType: Prefix

auth:
  enabled: true
  issuer: https://identity.diamond.ac.uk/realms/dls
  # once Keycloak has added the audience mapper from step 2:
  # client_audience: <client id>
```

### 6. Deploy and check

```bash
helm dependency update helm/xrpddatavis   # fetches oauth2-proxy into charts/
helm upgrade --install <release> helm/xrpddatavis -n $NS -f my-values.yaml
kubectl get pods -n $NS     # the app and <release>-oauth2-proxy should both be Running
```

Open `https://<your host>`. You should be sent to the Diamond login page, then
back to the app with your name shown in the top right.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| oauth2-proxy pod stuck in `CreateContainerConfigError` | the keycloak secret doesn't exist yet: `encryptedData` is still blank, or was sealed for a different namespace or name (`kubectl describe sealedsecret -n $NS`) |
| Keycloak says "Invalid redirect uri" | the client's redirect URI isn't exactly `https://<host>/oauth2/callback` |
| `502` straight after login | nginx header buffer too small; keep the `proxy-buffer-size` ingress annotation |
| Logged in, but every API call returns `401 Invalid access token: Audience doesn't match` | `auth.client_audience` doesn't match the token's `aud` claim |
| Changes to `auth` values have no effect | oauth2-proxy reads its config only at start-up: `kubectl rollout restart deployment <release>-oauth2-proxy -n $NS` |

## Turning login off

`auth.enabled: false` removes oauth2-proxy and the SealedSecret, points the
ingress straight at the app, and turns off the app's token check. Anyone who
can reach the address can then read and change the plots.
