import { Link, NavLink } from "react-router-dom";

function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          ReadersHub
        </Link>

        <nav className="navbar-links">
          <NavLink to="/books" className="nav-link">Books</NavLink>
          <NavLink to="/search" className="nav-link">Search</NavLink>
          <NavLink to="/dashboard" className="nav-link">Dashboard</NavLink>
          <NavLink to="/login" className="nav-link nav-link-primary">Log in</NavLink>
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
