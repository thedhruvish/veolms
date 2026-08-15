import { GitHubBrandIcon, GoogleBrandIcon } from "./SocialBrandIcons";

export function SocialLoginActions() {
  return (
    <div className="auth-social">
      <p className="auth-social__divider">
        <span>OR</span>
      </p>

      <div className="auth-social__actions">
        <button className="auth-social__button" type="button">
          <GoogleBrandIcon size={18} />
          Continue with Google
        </button>

        <button className="auth-social__button" type="button">
          <GitHubBrandIcon size={18} />
          Continue with GitHub
        </button>
      </div>
    </div>
  );
}
