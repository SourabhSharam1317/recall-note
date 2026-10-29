
"use strict";

const $ = (selector) => document.querySelector(selector);

const els = {
  newNote: $("#newNoteBtn"),
  emptyNew: $("#emptyNewNoteBtn"),
  editorNew: $("#editorNewNoteBtn"),
  search: $("#searchInput"),
  allCount: $("#allCount"),
  noteCount: $("#noteCount"),
  viewTitle: $("#viewTitle"),
  notesList: $("#notesList"),
  emptyNotes: $("#emptyNotes"),
  folderList: $("#folderList"),
  tagList: $("#tagList"),
  addFolder: $("#addFolderBtn"),
  editorEmpty: $("#editorEmpty"),
  editor: $("#noteEditor"),
  title: $("#noteTitle"),
  content: $("#noteContent"),
  folder: $("#noteFolder"),
  tags: $("#noteTags"),
  preview: $("#markdownPreview"),
  writingArea: $("#writingArea"),
  editTab: $("#editTab"),
  previewTab: $("#previewTab"),
  splitTab: $("#splitTab"),
  saveStatus: $("#saveStatus"),
  breadcrumb: $("#breadcrumbTitle"),
  pin: $("#pinBtn"),
  history: $("#historyBtn"),
  backlinks: $("#backlinksBtn"),
  delete: $("#deleteBtn"),
  wordCount: $("#wordCount"),
  updatedAt: $("#updatedAt"),
  palette: $("#commandPalette"),
  commandInput: $("#commandInput"),
  commandResults: $("#commandResults"),
  dialog: $("#dialog"),
  dialogTitle: $("#dialogTitle"),
  dialogMessage: $("#dialogMessage"),
  dialogBody: $("#dialogBody"),
  dialogConfirm: $("#dialogConfirm"),
  dialogCancel: $("#dialogCancel"),
  importFile: $("#importFile")
};

let notes = [];
let folders = [];
let activeNoteId = null;
let currentView = "all";
let selectedFolderId = null;
let selectedTag = null;
let searchQuery = "";
let editorMode = "edit";
let saveTimer = null;
let pendingDialogAction = null;
let commandItems = [];

const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

const now = () => new Date().toISOString();

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function activeNote() {
  return notes.find(note => note.id === activeNoteId) || null;
}

function sortedNotes(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return Number(b.pinned) - Number(a.pinned);
    }

    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function formatDateTime(value) {
  if (!value) return "Unknown";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleString();
}

function wordTotal(text) {
  return text.trim()
    ? text.trim().split(/\s+/).length
    : 0;
}

/* Dialogs */

function ask(title, message, action, options = {}) {
  els.dialogTitle.textContent = title;
  els.dialogMessage.textContent = message;
  els.dialogBody.replaceChildren();
  els.dialogConfirm.textContent = options.confirmText || "Confirm";
  els.dialogCancel.classList.remove("hidden");
  pendingDialogAction = action;
  els.dialog.classList.remove("hidden");

  if (options.input) {
    const input = document.createElement("input");
    input.id = "dialogInput";
    input.placeholder = options.placeholder || "";
    input.value = options.value || "";
    input.maxLength = 200;
    input.style.cssText =
      "width:100%;padding:10px;background:#111318;color:#eceef4;" +
      "border:1px solid #2b303b;border-radius:7px;margin-top:8px";
    els.dialogBody.append(input);
    setTimeout(() => input.focus(), 0);
  }
}

function closeDialog() {
  els.dialog.classList.add("hidden");
  pendingDialogAction = null;
}

els.dialogCancel.addEventListener("click", closeDialog);

els.dialog.addEventListener("click", event => {
  if (event.target === els.dialog) closeDialog();
});

els.dialogConfirm.addEventListener("click", async () => {
  const action = pendingDialogAction;
  const input = $("#dialogInput");
  const value = input ? input.value.trim() : null;

  closeDialog();

  if (action) {
    try {
      await action(value);
    } catch (error) {
      reportError(error);
    }
  }
});

function reportError(error) {
  console.error(error);
  alert("Something went wrong: " + (error.message || error));
}

/* Markdown renderer */

function inlineMarkdown(text) {
  let output = escapeHTML(text);

  // Inline code first, so its content is not formatted.
  const codeParts = [];

  output = output.replace(/`([^`\n]+)`/g, (_, code) => {
    codeParts.push(code);
    return `@@CODE${codeParts.length - 1}@@`;
  });

  // Only allow safe web links and local note links.
  output = output.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, title) =>
      `<a href="#" class="wiki-link" data-note-title="${title.trim()}">` +
      `${title.trim()}</a>`
  );

  output = output.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => {
      const safeUrl = url.replace(/&amp;/g, "&");
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">` +
        `${label}</a>`;
    }
  );

  output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__(.+?)__/g, "<strong>$1</strong>");
  output = output.replace(/\*(.+?)\*/g, "<em>$1</em>");
  output = output.replace(/_(.+?)_/g, "<em>$1</em>");
  output = output.replace(/~~(.+?)~~/g, "<del>$1</del>");

  return output.replace(/@@CODE(\d+)@@/g, (_, index) =>
    `<code>${codeParts[Number(index)]}</code>`
  );
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const output = [];

  let inCode = false;
  let codeLines = [];
  let listType = null;
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length) {
      output.push(`<p>${inlineMarkdown(paragraph.join("\n"))
        .replace(/\n/g, "<br>")}</p>`);
      paragraph = [];
    }
  }

  function closeList() {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  }

  function closeBlocks() {
    flushParagraph();
    closeList();
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeBlocks();

      if (inCode) {
        output.push(
          `<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }

      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeBlocks();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);

    if (heading) {
      closeBlocks();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      closeBlocks();
      output.push("<hr>");
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);

    if (quote) {
      closeBlocks();
      output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const listMatch = unordered || ordered;

    if (listMatch) {
      flushParagraph();

      const wantedType = unordered ? "ul" : "ol";

      if (listType !== wantedType) {
        closeList();
        listType = wantedType;
        output.push(`<${listType}>`);
      }

      output.push(`<li>${inlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  flushParagraph();
  closeList();

  if (inCode) {
    output.push(
      `<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`
    );
  }

  return output.join("\n");
}

/* Note and folder loading */

async function refreshData() {
  [notes, folders] = await Promise.all([
    RecallDB.getNotes(),
    RecallDB.getFolders()
  ]);

  renderFolders();
  renderTags();
  renderNoteList();

  if (activeNoteId) {
    const note = activeNote();

    if (note && !note.trashed) {
      showEditor(note);
    } else if (!note) {
      activeNoteId = null;
      showEmptyEditor();
    }
  } else {
    showEmptyEditor();
  }
}

function showEmptyEditor() {
  els.editor.classList.add("hidden");
  els.editorEmpty.classList.remove("hidden");
  els.breadcrumb.textContent = "Untitled";
  els.saveStatus.textContent = "No note selected";
}

async function createNote() {
  const timestamp = now();

  const note = {
    id: uid(),
    title: "",
    content: "",
    tags: [],
    folderId: selectedFolderId || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    pinned: false,
    trashed: false,
    versions: []
  };

  await RecallDB.saveNote(note);
  notes.push(note);
  activeNoteId = note.id;

  renderNoteList();
  showEditor(note);

  els.title.focus();
}

function showEditor(note) {
  els.editorEmpty.classList.add("hidden");
  els.editor.classList.remove("hidden");

  els.title.value = note.title;
  els.content.value = note.content;
  els.tags.value = note.tags.join(", ");
  els.folder.value = note.folderId || "";

  els.breadcrumb.textContent = note.title || "Untitled";
  els.pin.classList.toggle("pinned", Boolean(note.pinned));
  els.pin.title = note.pinned ? "Unpin note" : "Pin note";
  els.updatedAt.textContent = "Updated " + formatDateTime(note.updatedAt);

  renderPreview();
  updateWordCount();
  updateSaveStatus("All changes saved");
}

function renderPreview() {
  const note = activeNote();
  els.preview.innerHTML = renderMarkdown(els.content.value);

  // Wiki links navigate to the corresponding note.
  els.preview.querySelectorAll(".wiki-link").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();

      const title = link.dataset.noteTitle.toLowerCase();
      const target = notes.find(note =>
        !note.trashed && note.title.trim().toLowerCase() === title
      );

      if (target) {
        selectNote(target.id);
      } else {
        ask(
          "Note not found",
          `Create a note titled "${link.dataset.noteTitle}"?`,
          async () => {
            const created = {
              id: uid(),
              title: link.dataset.noteTitle,
              content: "",
              tags: [],
              folderId: note?.folderId || null,
              createdAt: now(),
              updatedAt: now(),
              pinned: false,
              trashed: false,
              versions: []
            };

            await RecallDB.saveNote(created);
            notes.push(created);
            await selectNote(created.id);
          },
          { confirmText: "Create note" }
        );
      }
    });
  });
}

async function selectNote(id) {
  const note = notes.find(item => item.id === id);

  if (!note || (note.trashed && currentView !== "trash")) return;

  activeNoteId = id;
  selectedFolderId = null;
  selectedTag = null;

  await renderNoteList();
  showEditor(note);
}

/* Autosave and versions */

function updateSaveStatus(message) {
  els.saveStatus.textContent = message;
}

function scheduleSave() {
  const note = activeNote();
  if (!note) return;

  updateSaveStatus("Unsaved changes...");

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCurrentNote(), 400);
}

async function saveCurrentNote() {
  const note = activeNote();
  if (!note) return;

  const title = els.title.value.trim();
  const content = els.content.value;

  const changed = title !== note.title || content !== note.content;

  if (!changed &&
      (els.folder.value || null) === (note.folderId || null) &&
      els.tags.value.split(",").map(tag => tag.trim()).filter(Boolean)
        .join("|") === note.tags.join("|")) {
    updateSaveStatus("All changes saved");
    return;
  }

  if (changed) {
    const snapshot = {
      title: note.title,
      content: note.content,
      savedAt: now()
    };

    const versions = [...(note.versions || [])];

    if (note.title || note.content) {
      versions.push(snapshot);
    }

    // Keep the last 30 previous versions.
    note.versions = versions.slice(-30);
  }

  note.title = title;
  note.content = content;
  note.folderId = els.folder.value || null;
  note.tags = [...new Set(
    els.tags.value.split(",")
      .map(tag => tag.trim())
      .filter(Boolean)
  )];
  note.updatedAt = now();

  try {
    await RecallDB.saveNote(note);

    updateSaveStatus("All changes saved");
    els.breadcrumb.textContent = note.title || "Untitled";
    els.updatedAt.textContent = "Updated " + formatDateTime(note.updatedAt);

    renderPreview();
    updateWordCount();
    renderNoteList();
    renderTags();
  } catch (error) {
    updateSaveStatus("Save failed");
    reportError(error);
  }
}

async function flushSave() {
  clearTimeout(saveTimer);
  await saveCurrentNote();
}

els.title.addEventListener("input", scheduleSave);
els.content.addEventListener("input", () => {
  renderPreview();
  updateWordCount();
  scheduleSave();
});
els.tags.addEventListener("input", scheduleSave);
els.folder.addEventListener("change", scheduleSave);

function updateWordCount() {
  els.wordCount.textContent =
    `${wordTotal(els.content.value)} words`;
}

/* Note list and ranked search */

function getVisibleNotes() {
  let result = [...notes];

  if (currentView === "trash") {
    result = result.filter(note => note.trashed);
  } else {
    result = result.filter(note => !note.trashed);

    if (currentView === "pinned") {
      result = result.filter(note => note.pinned);
    }

    if (currentView === "recent") {
      result = result.slice().sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      ).slice(0, 20);
    }
  }

  if (selectedFolderId) {
    result = result.filter(note =>
      note.folderId === selectedFolderId
    );
  }

  if (selectedTag) {
    result = result.filter(note =>
      note.tags.includes(selectedTag)
    );
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);

    result = result.map(note => {
      const title = (note.title || "").toLowerCase();
      const body = (note.content || "").toLowerCase();
      const tags = note.tags.join(" ").toLowerCase();

      const matches = terms.every(term =>
        title.includes(term) ||
        body.includes(term) ||
        tags.includes(term)
      );

      let score = 0;

      if (matches) {
        for (const term of terms) {
          if (title.includes(term)) score += 10;
          if (title.startsWith(term)) score += 5;
          if (body.includes(term)) score += 2;
          if (tags.includes(term)) score += 4;
        }
      }

      return { note, matches, score };
    })
    .filter(item => item.matches)
    .sort((a, b) =>
      b.score - a.score ||
      new Date(b.note.updatedAt) - new Date(a.note.updatedAt)
    )
    .map(item => item.note);

    return result;
  }

  return sortedNotes(result);
}

function renderNoteList() {
  const visible = getVisibleNotes();

  els.notesList.replaceChildren();
  els.emptyNotes.classList.toggle("visible", visible.length === 0);

  els.allCount.textContent =
    notes.filter(note => !note.trashed).length;

  els.noteCount.textContent =
    `${visible.length} ${visible.length === 1 ? "note" : "notes"}`;

  const labels = {
    all: "All notes",
    pinned: "Pinned notes",
    recent: "Recent notes",
    trash: "Trash"
  };

  if (selectedFolderId) {
    els.viewTitle.textContent =
      folders.find(folder => folder.id === selectedFolderId)?.name ||
      "Folder";
  } else if (selectedTag) {
    els.viewTitle.textContent = "#" + selectedTag;
  } else if (searchQuery) {
    els.viewTitle.textContent = "Search results";
  } else {
    els.viewTitle.textContent = labels[currentView] || "All notes";
  }

  for (const note of visible) {
    const card = document.createElement("div");
    card.className = "note-card" +
      (note.id === activeNoteId ? " active" : "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", note.title || "Untitled note");

    const title = document.createElement("h3");
    title.textContent =
      (note.pinned ? "📌 " : "") + (note.title || "Untitled");

    const excerpt = document.createElement("p");
    excerpt.textContent = (note.content || "No content yet")
      .replace(/[#>*_`[\]]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 110);

    const footer = document.createElement("div");
    footer.className = "note-card-footer";

    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = formatDate(note.updatedAt);
    footer.append(date);

    for (const tag of note.tags.slice(0, 2)) {
      const badge = document.createElement("span");
      badge.className = "note-tag";
      badge.textContent = "#" + tag;
      footer.append(badge);
    }

    card.append(title, excerpt, footer);

    card.addEventListener("click", async () => {
      if (currentView === "trash") {
        activeNoteId = note.id;
        await renderNoteList();
        showEditor(note);
        return;
      }

      await flushSave();
      await selectNote(note.id);
    });

    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });

    els.notesList.append(card);
  }

  if (currentView === "trash") {
    // Restore or permanently delete trashed notes from the selected editor.
    els.delete.textContent = "↩";
    els.delete.title = "Restore note";
  } else {
    els.delete.textContent = "♲";
    els.delete.title = "Move to trash";
  }
}

/* Folders, including nested folders */

function folderLabel(folder) {
  const names = [];
  let current = folder;
  const visited = new Set();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = folders.find(item => item.id === current.parentId);
  }

  return names.join(" / ");
}

function renderFolders() {
  els.folderList.replaceChildren();

  const ordered = [...folders].sort((a, b) =>
    folderLabel(a).localeCompare(folderLabel(b))
  );

  for (const folder of ordered) {
    const button = document.createElement("button");
    button.className = "folder-item" +
      (selectedFolderId === folder.id ? " selected" : "");
    button.textContent = "▸ " + folderLabel(folder);
    button.title = folderLabel(folder);

    button.addEventListener("click", async () => {
      await flushSave();

      currentView = "all";
      selectedFolderId =
        selectedFolderId === folder.id ? null : folder.id;
      selectedTag = null;

      renderFolders();
      renderNoteList();
    });

    els.folderList.append(button);
  }

  els.folder.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "No folder";
  els.folder.append(defaultOption);

  for (const folder of ordered) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folderLabel(folder);
    els.folder.append(option);
  }
}

els.addFolder.addEventListener("click", () => {
  ask(
    "Create a folder",
    "Give your folder a name. Optionally, choose a parent folder ID in a later version.",
    async name => {
      if (!name) return;

      const duplicate = folders.some(folder =>
        folder.name.toLowerCase() === name.toLowerCase() &&
        folder.parentId === (selectedFolderId || null)
      );

      if (duplicate) {
        alert("A folder with this name already exists here.");
        return;
      }

      const folder = {
        id: uid(),
        name,
        parentId: selectedFolderId || null,
        createdAt: now()
      };

      await RecallDB.saveFolder(folder);
      folders.push(folder);

      renderFolders();
      renderNoteList();
    },
    { input: true, placeholder: "e.g. Computer Science" }
  );
});

/* Tags */

function renderTags() {
  const counts = new Map();

  for (const note of notes.filter(item => !item.trashed)) {
    for (const tag of note.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  els.tagList.replaceChildren();

  for (const [tag] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const button = document.createElement("button");
    button.className = "tag-item" +
      (selectedTag === tag ? " selected" : "");
    button.textContent = "#" + tag;

    button.addEventListener("click", async () => {
      await flushSave();

      selectedTag = selectedTag === tag ? null : tag;
      selectedFolderId = null;
      currentView = "all";

      renderTags();
      renderFolders();
      renderNoteList();
    });

    els.tagList.append(button);
  }
}

/* Views and note actions */

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", async () => {
    await flushSave();

    currentView = button.dataset.view;
    selectedFolderId = null;
    selectedTag = null;

    document.querySelectorAll(".nav-item").forEach(item =>
      item.classList.toggle("active", item === button)
    );

    renderFolders();
    renderTags();
    renderNoteList();
  });
});

els.search.addEventListener("input", () => {
  searchQuery = els.search.value.trim();
  renderNoteList();
});

els.newNote.addEventListener("click", async () => {
  await flushSave();
  await createNote();
});

els.emptyNew.addEventListener("click", async () => {
  await flushSave();
  await createNote();
});

els.editorNew.addEventListener("click", async () => {
  await flushSave();
  await createNote();
});

els.pin.addEventListener("click", async () => {
  const note = activeNote();
  if (!note) return;

  await flushSave();

  note.pinned = !note.pinned;
  note.updatedAt = now();

  await RecallDB.saveNote(note);
  showEditor(note);
  renderNoteList();
});

els.delete.addEventListener("click", async () => {
  const note = activeNote();
  if (!note) return;

  if (note.trashed) {
    ask("Restore note", "Restore this note from the trash?", async () => {
      note.trashed = false;
      note.updatedAt = now();
      await RecallDB.saveNote(note);

      currentView = "all";
      activeNoteId = note.id;
      await refreshData();
    }, { confirmText: "Restore" });

    return;
  }

  ask("Move to trash", "You can restore this note later.", async () => {
    await flushSave();

    note.trashed = true;
    note.updatedAt = now();

    await RecallDB.saveNote(note);

    activeNoteId = null;
    await refreshData();
  }, { confirmText: "Move to trash" });
});

/* Editor display modes */

function setEditorMode(mode) {
  editorMode = mode;

  els.writingArea.classList.remove(
    "mode-edit", "mode-preview", "mode-split"
  );
  els.writingArea.classList.add("mode-" + mode);

  [
    [els.editTab, "edit"],
    [els.previewTab, "preview"],
    [els.splitTab, "split"]
  ].forEach(([button, value]) =>
    button.classList.toggle("active", mode === value)
  );

  renderPreview();
}

els.editTab.addEventListener("click", () => setEditorMode("edit"));
els.previewTab.addEventListener("click", () => setEditorMode("preview"));
els.splitTab.addEventListener("click", () => setEditorMode("split"));

/* Backlinks */

function getBacklinks(note) {
  const title = (note.title || "").trim().toLowerCase();
  if (!title) return [];

  return notes.filter(other =>
    !other.trashed &&
    other.id !== note.id &&
    (other.content || "").match(/\[\[([^\]]+)\]\]/g)?.some(link =>
      link.slice(2, -2).trim().toLowerCase() === title
    )
  );
}

els.backlinks.addEventListener("click", async () => {
  await flushSave();

  const note = activeNote();
  if (!note) return;

  const links = getBacklinks(note);

  els.dialogTitle.textContent = "Backlinks";
  els.dialogMessage.textContent =
    links.length ? "Notes that link to this note:" : "No backlinks yet.";

  els.dialogBody.replaceChildren();

  for (const linkedNote of links) {
    const button = document.createElement("button");
    button.className = "command-option";
    button.textContent = linkedNote.title || "Untitled";

    button.addEventListener("click", async () => {
      closeDialog();
      await selectNote(linkedNote.id);
    });

    els.dialogBody.append(button);
  }

  pendingDialogAction = null;
  els.dialogCancel.classList.add("hidden");
  els.dialogConfirm.textContent = "Close";
  pendingDialogAction = null;
  els.dialog.classList.remove("hidden");
});

/* Version history */

els.history.addEventListener("click", async () => {
  await flushSave();

  const note = activeNote();
  if (!note) return;

  const versions = [...(note.versions || [])].reverse();

  els.dialogTitle.textContent = "Version history";
  els.dialogMessage.textContent = versions.length
    ? "Select a previous version to restore."
    : "No previous versions have been saved yet.";

  els.dialogBody.replaceChildren();

  for (const version of versions) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "padding:10px 0;border-bottom:1px solid #2b303b";

    const label = document.createElement("p");
    label.textContent =
      `${version.title || "Untitled"} — ${formatDateTime(version.savedAt)}`;

    const restore = document.createElement("button");
    restore.className = "secondary-btn";
    restore.textContent = "Restore this version";

    restore.addEventListener("click", async () => {
      note.versions.push({
        title: note.title,
        content: note.content,
        savedAt: now()
      });

      note.versions = note.versions.slice(-30);
      note.title = version.title;
      note.content = version.content;
      note.updatedAt = now();

      await RecallDB.saveNote(note);
      closeDialog();
      showEditor(note);
      renderNoteList();
    });

    wrapper.append(label, restore);
    els.dialogBody.append(wrapper);
  }

  pendingDialogAction = null;
  els.dialogCancel.classList.remove("hidden");
  els.dialogConfirm.textContent = "Close";
  els.dialogConfirm.onclick = () => {
    closeDialog();
    els.dialogConfirm.onclick = null;
  };

  els.dialog.classList.remove("hidden");
});

/* Duplicate detection */

function checkDuplicate(note) {
  const normalized = text =>
    text.toLowerCase().replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ").trim();

  const title = normalized(note.title);
  const content = normalized(note.content);

  if (!title && !content) return null;

  return notes.find(other => {
    if (other.id === note.id || other.trashed) return false;

    const otherTitle = normalized(other.title);
    const otherContent = normalized(other.content);

    return (title && title === otherTitle) ||
      (content.length > 40 && content === otherContent);
  }) || null;
}

async function saveWithDuplicateCheck() {
  const note = activeNote();
  if (!note) return;

  await flushSave();

  const duplicate = checkDuplicate(note);

  if (duplicate) {
    ask(
      "Possible duplicate",
      `A similar note already exists: "${duplicate.title || "Untitled"}". Save anyway?`,
      async () => {
        updateSaveStatus("All changes saved");
      },
      { confirmText: "Keep both" }
    );
  }
}

/* JSON and Markdown export */

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJSON() {
  await flushSave();

  const data = {
    app: "Recall",
    schemaVersion: 1,
    exportedAt: now(),
    notes,
    folders
  };

  downloadFile(
    "recall-backup.json",
    JSON.stringify(data, null, 2),
    "application/json"
  );
}

async function exportMarkdown() {
  await flushSave();

  const note = activeNote();

  if (note) {
    downloadFile(
      (note.title || "note").replace(/[\\/:*?"<>|]/g, "_") + ".md",
      `# ${note.title || "Untitled"}\n\n${note.content}`,
      "text/markdown;charset=utf-8"
    );

    return;
  }

  const activeNotes = notes.filter(note => !note.trashed);

  for (const note of activeNotes) {
    downloadFile(
      (note.title || "note").replace(/[\\/:*?"<>|]/g, "_") + ".md",
      `# ${note.title || "Untitled"}\n\n${note.content}`,
      "text/markdown;charset=utf-8"
    );
  }
}

/* Import JSON backups or individual Markdown files */

els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files[0];
  if (!file) return;

  try {
    const text = await file.text();

    if (file.name.toLowerCase().endsWith(".json")) {
      const data = JSON.parse(text);

      if (!data || !Array.isArray(data.notes) ||
          !Array.isArray(data.folders)) {
        throw new Error("This is not a valid Recall backup.");
      }

      ask(
        "Import backup",
        `Import ${data.notes.length} notes and ${data.folders.length} folders? Existing data will be kept; matching IDs will be overwritten.`,
        async () => {
          for (const folder of data.folders) {
            if (!folder.id || !folder.name) continue;
            await RecallDB.saveFolder(folder);
          }

          for (const note of data.notes) {
            if (!note.id) continue;

            await RecallDB.saveNote({
              ...note,
              tags: Array.isArray(note.tags) ? note.tags : [],
              versions: Array.isArray(note.versions) ? note.versions : [],
              trashed: Boolean(note.trashed),
              pinned: Boolean(note.pinned)
            });
          }

          await refreshData();
          alert("Import completed.");
        },
        { confirmText: "Import" }
      );
    } else {
      const title = file.name.replace(/\.(md|markdown)$/i, "");

      const note = {
        id: uid(),
        title,
        content: text,
        tags: [],
        folderId: null,
        createdAt: now(),
        updatedAt: now(),
        pinned: false,
        trashed: false,
        versions: []
      };

      await RecallDB.saveNote(note);
      await refreshData();
      await selectNote(note.id);
    }
  } catch (error) {
    reportError(error);
  } finally {
    els.importFile.value = "";
  }
});

/* Command palette */

function buildCommands() {
  commandItems = [
    {
      label: "Create new note",
      action: createNote
    },
    {
      label: "Export all notes as JSON",
      action: exportJSON
    },
    {
      label: "Export notes as Markdown",
      action: exportMarkdown
    },
    {
      label: "Import notes",
      action: () => els.importFile.click()
    },
    {
      label: "Show all notes",
      action: () => setView("all")
    },
    {
      label: "Show pinned notes",
      action: () => setView("pinned")
    },
    {
      label: "Show recent notes",
      action: () => setView("recent")
    },
    {
      label: "Show trash",
      action: () => setView("trash")
    },
    {
      label: "Toggle preview",
      action: () => setEditorMode(
        editorMode === "preview" ? "edit" : "preview"
      )
    },
    {
      label: "Show graph view",
      action: showGraph
    }
  ];
}

async function setView(view) {
  await flushSave();

  currentView = view;
  selectedFolderId = null;
  selectedTag = null;

  document.querySelectorAll(".nav-item").forEach(button =>
    button.classList.toggle("active", button.dataset.view === view)
  );

  renderFolders();
  renderTags();
  renderNoteList();
}

function renderCommands(query = "") {
  const filtered = commandItems.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  els.commandResults.replaceChildren();

  filtered.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "command-option";
    button.textContent = `${index + 1}. ${item.label}`;

    button.addEventListener("click", async () => {
      closePalette();
      try {
        await item.action();
      } catch (error) {
        reportError(error);
      }
    });

    els.commandResults.append(button);
  });
}

function openPalette() {
  buildCommands();
  els.palette.classList.remove("hidden");
  els.commandInput.value = "";
  renderCommands();
  els.commandInput.focus();
}

function closePalette() {
  els.palette.classList.add("hidden");
}

els.search.addEventListener("keydown", event => {
  if (event.key === "Enter" && searchQuery) {
    setView("all");
  }
});

els.commandInput.addEventListener("input", () =>
  renderCommands(els.commandInput.value)
);

els.commandInput.addEventListener("keydown", async event => {
  if (event.key === "Escape") closePalette();

  if (event.key === "Enter") {
    const first = els.commandResults.querySelector("button");
    if (first) first.click();
  }
});

els.palette.addEventListener("click", event => {
  if (event.target === els.palette) closePalette();
});

/* Simple graph of note connections */

async function showGraph() {
  await flushSave();

  const linkedNotes = notes.filter(note => !note.trashed);
  const nodes = linkedNotes.map(note => ({
    title: note.title || "Untitled",
    links: (note.content.match(/\[\[([^\]]+)\]\]/g) || [])
      .map(link => link.slice(2, -2))
  }));

  els.dialogTitle.textContent = "Knowledge graph";
  els.dialogMessage.textContent =
    "Text view of your note connections. Wiki links use [[note title]].";
  els.dialogBody.replaceChildren();

  const pre = document.createElement("pre");
  pre.style.cssText =
    "white-space:pre-wrap;overflow:auto;max-height:45vh;" +
    "font-size:12px;color:#eceef4";

  pre.textContent = nodes.map(node =>
    `${node.title}\n  → ${node.links.length
      ? node.links.join(", ")
      : "No outgoing links"}`
  ).join("\n\n");

  els.dialogBody.append(pre);

  pendingDialogAction = null;
  els.dialogCancel.classList.add("hidden");
  els.dialogConfirm.textContent = "Close";
  els.dialogConfirm.onclick = () => {
    closeDialog();
    els.dialogConfirm.onclick = null;
  };

  els.dialog.classList.remove("hidden");
}

/* Keyboard shortcuts */

document.addEventListener("keydown", async event => {
  const modifier = event.ctrlKey || event.metaKey;

  if (event.key === "Escape") {
    closePalette();

    if (!els.dialog.classList.contains("hidden")) {
      closeDialog();
    }
  }

  if (modifier && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openPalette();
  }

  if (modifier && event.key.toLowerCase() === "n") {
    event.preventDefault();
    await flushSave();
    await createNote();
  }

  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    await flushSave();
  }

  if (modifier && event.key.toLowerCase() === "e") {
    event.preventDefault();
    await exportJSON();
  }
});

/* Start application */

async function init() {
  try {
    await RecallDB.open();
    await refreshData();
    buildCommands();

    // Register the offline service worker when served over localhost or HTTPS.
    if ("serviceWorker" in navigator &&
        (location.protocol === "https:" ||
         location.hostname === "localhost" ||
         location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("./sw.js").catch(console.error);
    }

    console.info("Recall is ready.");
  } catch (error) {
    console.error(error);
    alert(
      "Recall could not initialize its local database. " +
      "Open the project through a local web server and try again."
    );
  }
}

init();
