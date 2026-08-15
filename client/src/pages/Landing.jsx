import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Features from "../components/Features";
import About from "../components/About";
import Footer from "../components/Footer";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <Features />
      <About />
      <Footer />
    </div>
  );
}
