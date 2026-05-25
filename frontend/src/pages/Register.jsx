import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Leaf, Eye, EyeOff, Building2, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';

const INIT = {
  companyName: '', companyEmail: '', companyPhone: '',
  adminName: '', adminEmail: '', password: '', confirmPassword: ''
};

export default function Register() {
  const [form, setForm]       = useState(INIT);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register }          = useAuth();
  const notify                = useNotify();
  const navigate              = useNavigate();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      return notify('Passwords do not match', 'error');
    }
    if (form.password.length < 6) {
      return notify('Password must be at least 6 characters', 'error');
    }
    setLoading(true);
    try {
      await register({
        companyName:  form.companyName,
        companyEmail: form.companyEmail,
        companyPhone: form.companyPhone,
        adminName:    form.adminName,
        adminEmail:   form.adminEmail,
        password:     form.password
      });
      notify('Company registered successfully!');
      navigate('/dashboard');
    } catch (err) {
      notify(err.response?.data?.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-800 to-brand-900 px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-white/10 rounded-2xl p-4 mb-4">
            <Leaf size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">FuelStation HR</h1>
          <p className="text-brand-200 mt-1">Register your company</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-brand-600" />
                <h3 className="font-semibold text-gray-800">Company Information</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Company Name *</label>
                  <input className="input" placeholder="Sage Energy Ltd." value={form.companyName}
                    onChange={set('companyName')} required />
                </div>
                <div>
                  <label className="label">Company Email *</label>
                  <input type="email" className="input" placeholder="info@sageenergy.ng" value={form.companyEmail}
                    onChange={set('companyEmail')} required />
                </div>
                <div>
                  <label className="label">Company Phone</label>
                  <input className="input" placeholder="+234 801 234 5678" value={form.companyPhone}
                    onChange={set('companyPhone')} />
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Admin section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <UserCircle size={18} className="text-brand-600" />
                <h3 className="font-semibold text-gray-800">Admin Account</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Full Name *</label>
                  <input className="input" placeholder="John Doe" value={form.adminName}
                    onChange={set('adminName')} required />
                </div>
                <div>
                  <label className="label">Email Address *</label>
                  <input type="email" className="input" placeholder="john@sageenergy.ng" value={form.adminEmail}
                    onChange={set('adminEmail')} required />
                </div>
                <div>
                  <label className="label">Password *</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} className="input pr-10"
                      placeholder="Minimum 6 characters" value={form.password}
                      onChange={set('password')} required />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute inset-y-0 right-3 text-gray-400">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Confirm Password *</label>
                  <input type="password" className="input" placeholder="Repeat password"
                    value={form.confirmPassword} onChange={set('confirmPassword')} required />
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Creating account…
                </span>
              ) : 'Create Company & Admin Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
