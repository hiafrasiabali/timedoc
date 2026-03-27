import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../../lib/api';

export default function ManageEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', display_name: '', role: 'employee' });
  const [editForm, setEditForm] = useState({ display_name: '', password: '', role: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const data = await getEmployees();
      setEmployees(data.employees);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createEmployee(form);
      setForm({ username: '', password: '', display_name: '', role: 'employee' });
      setShowAdd(false);
      loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (emp) => {
    setEditingId(emp.id);
    setEditForm({ display_name: emp.display_name, password: '', role: emp.role });
    setError('');
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const updates = { display_name: editForm.display_name, role: editForm.role };
      if (editForm.password) updates.password = editForm.password;
      await updateEmployee(editingId, updates);
      setEditingId(null);
      loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeactivate = async (id, currentlyActive) => {
    const action = currentlyActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this employee?`)) return;
    try {
      await updateEmployee(id, { is_active: !currentlyActive });
      loadEmployees();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h1>Manage Employees</h1>
        <button className="btn btn-primary" onClick={() => { setShowAdd(true); setError(''); }}>
          Add Employee
        </button>
      </div>

      {showAdd && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>New Employee</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Username</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="submit" className="btn btn-primary">Create</button>
              <button type="button" className="btn" style={{ background: '#f1f5f9' }} onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--text-light)' }}>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  {editingId === emp.id ? (
                    <>
                      <td>{emp.username}</td>
                      <td>
                        <input
                          value={editForm.display_name}
                          onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        >
                          <option value="employee">Employee</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="password"
                          placeholder="New password (optional)"
                          value={editForm.password}
                          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td colSpan={2}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" onClick={handleEdit}>Save</button>
                          <button className="btn btn-sm" style={{ background: '#f1f5f9' }} onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                        {error && <p className="error">{error}</p>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{emp.username}</td>
                      <td>{emp.display_name}</td>
                      <td>
                        <span className={`badge ${emp.role === 'admin' ? 'badge-admin' : 'badge-offline'}`}>
                          {emp.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${emp.is_active ? 'badge-online' : 'badge-offline'}`}>
                          {emp.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{emp.created_at?.slice(0, 10)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm" style={{ background: '#f1f5f9' }} onClick={() => startEdit(emp)}>
                            Edit
                          </button>
                          <button
                            className={`btn btn-sm ${emp.is_active ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => handleDeactivate(emp.id, emp.is_active)}
                          >
                            {emp.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
