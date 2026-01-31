import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-20 pt-12">
      <div className="hero-card">
        <h1 className="text-3xl font-display">Join Seamless Tiles</h1>
        <p className="mt-2 text-sm text-ink/70">
          Create an account to download originals and build collections.
        </p>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setLoading(true);
            const response = await fetch("/api/auth/register", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email, name }),
            });
            setLoading(false);
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              setError(data?.error ?? "Registration failed");
              return;
            }
            const data = await response.json().catch(() => ({}));
            if (data?.user?.status === "active") {
              navigate("/");
              return;
            }
            navigate(`/verify?email=${encodeURIComponent(email)}`);
          }}
        >
          <input
            className="input-field"
            type="text"
            name="name"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            className="input-field"
            type="email"
            name="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink/60">
          Already registered? <Link to="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
