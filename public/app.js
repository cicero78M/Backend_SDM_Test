const body = document.querySelector('#itemsBody');
const empty = document.querySelector('#emptyState');
const search = document.querySelector('#search');
const dialog = document.querySelector('#itemDialog');
const form = document.querySelector('#itemForm');
const alertBox = document.querySelector('#alert');
let items = [];

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const showAlert = (message, success = false) => { alertBox.textContent = message; alertBox.className = `alert ${success ? 'success' : ''}`; setTimeout(() => alertBox.classList.add('hidden'), 3500); };
const formatDate = (value) => new Date(`${value}Z`).toLocaleString('id-ID', { dateStyle: 'medium' });

function render() {
  const query = search.value.toLowerCase().trim();
  const filtered = items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query));
  body.innerHTML = filtered.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.description || '—')}</td><td><span class="badge ${item.status}">${item.status === 'active' ? 'Aktif' : 'Tidak aktif'}</span></td><td>${formatDate(item.created_at)}</td><td><div class="row-actions"><button data-edit="${item.id}">Edit</button><button class="delete" data-delete="${item.id}">Hapus</button></div></td></tr>`).join('');
  empty.classList.toggle('hidden', filtered.length > 0);
}

async function loadItems() { const response = await fetch('/api/items'); items = await response.json(); render(); }
function openForm(item = null) { document.querySelector('#dialogTitle').textContent = item ? 'Edit data' : 'Data baru'; document.querySelector('#itemId').value = item?.id || ''; document.querySelector('#name').value = item?.name || ''; document.querySelector('#description').value = item?.description || ''; document.querySelector('#status').value = item?.status || 'active'; dialog.showModal(); document.querySelector('#name').focus(); }

document.querySelector('#newButton').addEventListener('click', () => openForm());
document.querySelector('#closeButton').addEventListener('click', () => dialog.close());
document.querySelector('#cancelButton').addEventListener('click', () => dialog.close());
search.addEventListener('input', render);
body.addEventListener('click', async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) openForm(items.find((item) => item.id === Number(editId)));
  if (deleteId && confirm('Hapus data ini?')) { const response = await fetch(`/api/items/${deleteId}`, { method: 'DELETE' }); if (!response.ok) return showAlert('Data gagal dihapus.'); await loadItems(); showAlert('Data berhasil dihapus.', true); }
});
form.addEventListener('submit', async (event) => { event.preventDefault(); const id = document.querySelector('#itemId').value; const payload = { name: document.querySelector('#name').value, description: document.querySelector('#description').value, status: document.querySelector('#status').value }; const response = await fetch(id ? `/api/items/${id}` : '/api/items', { method: id ? 'PUT' : 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) return showAlert(data.error || 'Data gagal disimpan.'); dialog.close(); await loadItems(); showAlert(id ? 'Data berhasil diperbarui.' : 'Data berhasil ditambahkan.', true); });
loadItems().catch(() => showAlert('Tidak dapat memuat data. Pastikan server aktif.'));
