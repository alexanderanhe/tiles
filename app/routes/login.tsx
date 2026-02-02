import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-20 pt-12">
      <div className="hero-card">
        <h1 className="text-3xl font-display">Welcome back</h1>
        <p className="mt-2 text-sm text-ink/70">
          Sign in with your email and password.
        </p>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setLoading(true);
            const response = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email, password }),
            });
            setLoading(false);
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              setError(data?.error ?? "Login failed");
              return;
            }
            const data = await response.json().catch(() => ({}));
            if (data?.user?.status === "active") {
              navigate("/");
              return;
            }
            if (data?.requiresPasswordSetup) {
              navigate(`/verify?email=${encodeURIComponent(email)}`);
              return;
            }
            navigate(`/verify?email=${encodeURIComponent(email)}`);
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
          <input
            className="input-field"
            type="password"
            name="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink/60">
          New here? <Link to="/register" className="underline">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
