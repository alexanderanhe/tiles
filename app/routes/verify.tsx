import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

export default function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialEmail = params.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const codeDigits = useMemo(() => code.split("").slice(0, 6), [code]);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-20 pt-12">
      <div className="hero-card">
        <h1 className="text-3xl font-display">Verify your email</h1>
        <p className="mt-2 text-sm text-ink/70">
          Enter the 6-digit code and create your password to finish setup.
        </p>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            if (password.length < 8) {
              setError("Password must be at least 8 characters");
              return;
            }
            if (password !== confirm) {
              setError("Passwords do not match");
              return;
            }
            setLoading(true);
            const response = await fetch("/api/auth/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email, code, password }),
              credentials: "same-origin",
            });
            setLoading(false);
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              setError(data?.error ?? "Verification failed");
              return;
            }
            navigate("/");
          }}
        >
          <input
            className="input-field"
            type="email"
            name="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div
            className="relative"
            onClick={() => document.getElementById("code-input")?.focus()}
          >
            <input
              id="code-input"
              className="code-input"
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              required
              maxLength={6}
            />
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <span
                  key={index}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-sm font-semibold ${
                    isFocused && index === codeDigits.length ? "code-cell--active" : ""
                  }`}
                >
                  {codeDigits[index] ?? ""}
                </span>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <input
            className="input-field"
            type="password"
            name="password"
            placeholder="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
          <input
            className="input-field"
            type="password"
            name="confirm"
            placeholder="Confirm password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={8}
            required
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink/60">
          Need a new code? <Link to="/login" className="underline">Resend</Link>
        </p>
      </div>
    </main>
  );
}
