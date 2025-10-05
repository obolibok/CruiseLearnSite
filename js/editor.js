    const gridDiv = document.getElementById('grid');
    let collapsed = new Set();

    const columnDefs = [
      {
        headerName: 'Structure',
        colId: 'structure',
        minWidth: 200,
        editable: false,
		cellClass: 'struct-dim',
        cellRenderer: (p) => {
          const d = p.data || {};
          const level = (d.path?.length || 1) - 1;
          const key = (d.path || []).join('|');
          const hasChildren = !!d._hasChildren;
          const isCollapsed = collapsed.has(key);
          const caret = hasChildren ? (isCollapsed ? '▸' : '▾') : '';
          const baseName = d.type === 'chapter' ? (d.name || '(chapter name)') : (d.primaryText || '(primary text)');
          const name = d.type === 'chapter' ? `<strong>${baseName}</strong>` : baseName;
          const indent = level * 16;
          const caretHtml = hasChildren ? `<span class="caret" data-key="${key}">${caret}</span>` : '';
          return `<span style="margin-left:${indent}px">${caretHtml}<span>${name}</span></span>`;
        }
      },
      // Chapter fields
      { headerName: 'Chapter Name', field: 'name', minWidth: 220, tooltipField: 'name',
	    colSpan: p => (p.data?.type === 'topic' ? 3 : 1),
		valueGetter: p => (p.data?.type === 'topic' ? ' ' : p.data?.name)
	  },
      { headerName: 'Lang-pri', field: 'primaryLanguage', width: 100 },
      { headerName: 'Lang-sec', field: 'secondaryLanguage', width: 100 },
      // Topics/Subtopics
      { headerName: 'Primary', field: 'primaryText', minWidth: 180, tooltipField: 'primaryText',
	    colSpan: p => (p.data?.type === 'chapter' ? 4 : 1),
		valueGetter: p => (p.data?.type === 'chapter' ? ' ' : p.data?.primaryText)
	  },
      { headerName: 'Primary (speech)', field: 'primaryTextSpeech', minWidth: 160, tooltipField: 'primaryTextSpeech' },
      { headerName: 'Secondary', field: 'secondaryText', minWidth: 180, tooltipField: 'secondaryText' },
      { headerName: 'Secondary (speech)', field: 'secondaryTextSpeech', minWidth: 170, tooltipField: 'secondaryTextSpeech' },
      { headerName: 'Description', field: 'description', minWidth: 220, tooltipField: 'description' },
      { headerName: 'Metadata', field: 'metadata', minWidth: 200, tooltipField: 'metadata' }
    ];

    // Allowed fields + order (first item used as fallback for type)
    const COLS = {
      chapter: ['name','primaryLanguage','secondaryLanguage','description','metadata'],
      topic:   ['primaryText','primaryTextSpeech','secondaryText','secondaryTextSpeech','description','metadata']
    };
    const REQUIRED = { chapter: ['name','primaryLanguage'], topic: ['primaryText'] };

    const isEmpty = v => v == null || (typeof v === 'string' && v.trim() === '');
    const nullIfEmpty = v => (v == null || (typeof v === 'string' && v.trim() === '')) ? null : v;
    const rowHasErrors = row => (REQUIRED[row.type] || []).some(f => isEmpty(row[f]));

    columnDefs.forEach(cd => {
      if (!cd.field) return;
      cd.cellClass = params => {
        const allowed = params.data?.type === 'chapter' ? COLS.chapter : COLS.topic;
        const cls = [];
        // недоступные — гасим взаимодействие (как раньше)
        if (!allowed.includes(cd.field)) cls.push('cell-disabled');
        // обязательные пустые — красим как ошибку (как раньше)
        if ((REQUIRED[params.data?.type] || []).includes(cd.field) && isEmpty(params.data?.[cd.field])) cls.push('invalid');
        // ⬇️ NEW: серый фон у стартовой слитой ячейки
        if ((cd.field === 'name' && params.data?.type === 'topic') ||
            (cd.field === 'primaryText' && params.data?.type === 'chapter')) {
          cls.push('na-span');
        }
        return cls.join(' ');
      };
      cd.editable = params => {
        const allowed = params.data?.type === 'chapter' ? COLS.chapter : COLS.topic;
        return allowed.includes(cd.field);
      };
    });

    const gridOptions = {
      theme: agGrid.themeQuartzDark,
      columnDefs,
      enterNavigatesVertically: true,               // NEW: Excel-like Enter (вниз в режиме просмотра)
      enterNavigatesVerticallyAfterEdit: true,      // NEW: и после редактирования — сохранить и вниз
      getRowId: params => params.data.id,           // NEW: быстрый доступ к rowNode
      defaultColDef: {
        editable: true,
        resizable: true,
        sortable: false,
        filter: false,
        suppressKeyboardEvent: (params) => {
          const e = params.event;
          if (!e) return false;
          // НЕ трогаем Enter — за него отвечают флаги выше
          // не трогаем Ctrl+C / Ctrl+V
          if (e.ctrlKey && (e.key === 'c' || e.key === 'v')) return false;
          // Глотаем ctrl-навигацию/Del, чтобы браузер/грид не вмешивались
          if (e.ctrlKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete'].includes(e.key)) {
            e.preventDefault(); e.stopPropagation();
            return true;
          }
          return false;
        }
      },
      tooltipShowDelay: 500,
      tooltipHideDelay: 10000,
      rowData: [],
      animateRows: false,
      rowHeight: 30,
      getRowClass: p => rowHasErrors(p.data) ? 'row-invalid' : undefined,

      rowSelection: {
        mode: 'singleRow',
        copySelectedRows: false // ← оставляем фокус на копировании ячеек (Ctrl+C)
      },
      suppressClipboardPaste: false,          // явно разрешаем paste
      clipboardDelimiter: '\t',               // табы как в Excel/Sheets
      // НЕ копируем/вставляем в «недоступные» поля (в т.ч. слитые/NA и Structure)
      processCellForClipboard: (p) => {
        const data = p.node?.data || {};
        const field = p.column.getColId();
        const allowed = data.type === 'chapter' ? COLS.chapter : COLS.topic;
        if (field === 'structure' || !allowed.includes(field)) return ''; // NA/Structure → пусто
        return p.value ?? '';
      },
      processCellFromClipboard: (p) => {
        const data = p.node?.data || {};
        const field = p.column.getColId();
        const allowed = data.type === 'chapter' ? COLS.chapter : COLS.topic;
        if (!allowed.includes(field)) return data[field]; // блокируем paste в не-редактируемые
        return p.value;                                   // обычная вставка
      },

      isExternalFilterPresent: () => collapsed.size > 0,
      doesExternalFilterPass: node => {
        const p = node.data?.path || [];
        for (let i = 1; i < p.length; i++) {
          const pref = p.slice(0, i).join('|');
          if (collapsed.has(pref)) return false;
        }
        return true;
      },
      onCellClicked: ev => {
        if (ev.colDef?.colId === 'structure' && ev.event?.target?.classList?.contains('caret')) {
          const key = ev.event.target.getAttribute('data-key');
          if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
          gridOptions.api.onFilterChanged();
          gridOptions.api.refreshCells({ columns: ['structure'] });
        }
      },
      onFirstDataRendered: () => { enforceStrictCells(); recomputeHasChildren(); },
      onRowDataUpdated: ()   => { enforceStrictCells(); recomputeHasChildren(); },
    };

    const api = agGrid.createGrid(gridDiv, gridOptions);
    // Clipboard handlers (robust copy/cut/paste)
    gridDiv.addEventListener('copy', onCopy);
    gridDiv.addEventListener('cut', onCut);
    gridDiv.addEventListener('paste', onPaste);
    const DEBUG = false;
    const dbg = (...a) => { if (DEBUG) console.log('[editor]', ...a); };
    gridOptions.api = api;
    api.addEventListener('modelUpdated', recomputeHasChildren);
    api.addEventListener('rowDataUpdated', recomputeHasChildren);
    api.addEventListener('cellValueChanged', (ev) => {
      api.redrawRows({ rowNodes: [ev.node] }); // точечно снимаем «красную полосу»
    });
    // --- editing guards ---
    function isEditingInput(el){
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true
             || el.classList?.contains('ag-text-field-input');
    }
    function isGridEditing(){
      const list = api.getCellEditorInstances ? api.getCellEditorInstances() : [];
      return list && list.length > 0;
    }
    // ---------- Utilities ----------
    const defer = (fn) => requestAnimationFrame(fn); // NEW: переносим тяжёлые операции из keydown

    function enforceStrictCells(){ if (api) api.refreshCells({ force:true }); }
    function recomputeHasChildren(){
      if (!api) return;
      const counts = {};
      api.forEachNode(n => {
        const p = n.data?.path || [];
        if (p.length > 1){
          const parent = p.slice(0, p.length - 1).join('|');
          counts[parent] = (counts[parent]||0) + 1;
        }
      });
      api.forEachNode(n => {
        const key = (n.data?.path||[]).join('|');
        n.data._hasChildren = !!counts[key];
      });
      api.refreshCells({ columns: ['structure'] });
    }
    function getFocusedCtx(){
      const f = api.getFocusedCell();
      if (!f) { alert('Put cursor into a cell to perform this action.'); return null; }
      const node = api.getDisplayedRowAtIndex(f.rowIndex);
      if (!node) { alert('No focused row.'); return null; }
      const data = node.data;
      return { node, rowIndex: f.rowIndex, colId: f.column.getColId(), data };
    }
    function indexOfId(rows, id){ return rows.findIndex(r => r.id === id); }
    function uid(prefix){ return `${prefix}_${Math.random().toString(36).slice(2,9)}`; }

    function emptyRowForType(type, ref){
      if (type === 'chapter'){
        const id = uid('ch');
        return { id, type:'chapter', path:[id], primaryLanguage: ref?.primaryLanguage || 'de', secondaryLanguage: ref?.secondaryLanguage || 'ru', name:'', description:'', metadata:'' };
      } else {
        const id = uid('t');
        const ch = ref?.path?.[0] || 'ch_x';
        return { id, type:'topic', path:[ch, id], primaryText:'', primaryTextSpeech:'', secondaryText:'', secondaryTextSpeech:'', description:'', metadata:'' };
      }
    }

    function refocusById(id){
      const node = api.getRowNode(id);
      if (!node) return;
      const idx = node.rowIndex;
      const firstField = (COLS[node.data.type]||[])[0];
      api.ensureIndexVisible(idx);
      api.setFocusedCell(idx, firstField);
    }

    function afterInsertFocus(id){
      const node = api.getRowNode(id);
      if (!node) return;
      const idx = node.rowIndex, data = node.data;
      const firstField = (COLS[data.type]||[])[0];
      api.ensureIndexVisible(idx);
      api.setFocusedCell(idx, firstField);
      api.startEditingCell({ rowIndex: idx, colKey: firstField });
    }

    // ---------- Import / Export ----------
    function importChapterCollection(json){
      if (json.type !== 'chapter_collection') throw new Error('Expected type is "chapter_collection"');
      const rows = [];
      (json.chapters||[]).forEach(ch => {
        const chId = uid('ch');
        rows.push({
          id: chId, type:'chapter', path:[chId],
          name: ch.name || '',
          primaryLanguage: ch.primaryLanguage || 'de',
          secondaryLanguage: ch.secondaryLanguage || 'ru',
          description: ch.description || '',
          metadata: ch.metadata ?? ''
        });
        (ch.topics||[]).forEach(t => {
          const tId = uid('t');
          rows.push({
            id: tId, type:'topic', path:[chId, tId],
            primaryText: t.primaryText || '',
            primaryTextSpeech: t.primaryTextSpeech || '',
            secondaryText: t.secondaryText || '',
            secondaryTextSpeech: t.secondaryTextSpeech || '',
            description: t.description || '',
            metadata: t.metadata ?? ''
          });
          (t.subtopics||[]).forEach(s => {
            const sId = uid('s');
            rows.push({
              id: sId, type:'topic', path:[chId, tId, sId],
              primaryText: s.primaryText || '',
              primaryTextSpeech: s.primaryTextSpeech || '',
              secondaryText: s.secondaryText || '',
              secondaryTextSpeech: s.secondaryTextSpeech || '',
              description: s.description || '',
              metadata: s.metadata ?? ''
            });
          });
        });
      });
      return rows;
    }
    function exportChapterCollection(){
      const rows = [];
      api.forEachNodeAfterFilterAndSort(n => rows.push(n.data));
      const chapters = [];
      let currentCh = null, currentTop = null;
      for (const r of rows){
        if (r.type==='chapter' && r.path.length===1){
          currentCh = {
            primaryLanguage: r.primaryLanguage || 'de',
            secondaryLanguage: nullIfEmpty(r.secondaryLanguage),
            name: r.name || '',
            description: nullIfEmpty(r.description),
            metadata: nullIfEmpty(r.metadata),
            topics: []
          };
          chapters.push(currentCh);
          currentTop = null;
        } else if (r.type==='topic' && r.path.length===2){
          if (!currentCh) continue;
          currentTop = {
            primaryText: r.primaryText || '',
            primaryTextSpeech: nullIfEmpty(r.primaryTextSpeech),
            secondaryText: nullIfEmpty(r.secondaryText),
            secondaryTextSpeech: nullIfEmpty(r.secondaryTextSpeech),
            description: nullIfEmpty(r.description),
            metadata: nullIfEmpty(r.metadata),
            subtopics: []
          };
          currentCh.topics.push(currentTop);
        } else if (r.type==='topic' && r.path.length===3){
          if (!currentTop) continue;
          currentTop.subtopics.push({
            primaryText: r.primaryText || '',
            primaryTextSpeech: nullIfEmpty(r.primaryTextSpeech),
            secondaryText: nullIfEmpty(r.secondaryText),
            secondaryTextSpeech: nullIfEmpty(r.secondaryTextSpeech),
            description: nullIfEmpty(r.description),
            metadata: nullIfEmpty(r.metadata)
          });
        }
      }
      return { type:'chapter_collection', version:1, exportedAt:new Date().toISOString(), chapters };
    }

    // ---------- Toolbar (focus-based) ----------
    document.getElementById('btnNew').onclick = () => {
      const chId = uid('ch');
      api.setGridOption('rowData', [
        { id: chId, type:'chapter', path:[chId], name:'New chapter', primaryLanguage:'de', secondaryLanguage:'ru', description:'', metadata:'' },
        { id: uid('t'), type:'topic', path:[chId, uid('t')] }
      ]);
      collapsed.clear(); recomputeHasChildren(); api.onFilterChanged();
    };

    document.getElementById('fileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        api.setGridOption('rowData', importChapterCollection(json));
        collapsed.clear(); recomputeHasChildren(); api.onFilterChanged();
      } catch(err){
        alert('Import error: ' + err.message + '\n\nIf it is not JSON syntax, the problem may be in code/API.');
      }
      e.target.value = '';
    });

    document.getElementById('btnExport').onclick = () => {
      const { errors, first } = validateAll();
      if (errors.length) {
        api.ensureIndexVisible(first.rowIndex);
        api.setFocusedCell(first.rowIndex, first.field);
        api.refreshCells({ force: true });
        alert(`Please fill all mandatory fields (${errors.length}). Required cells are highlighted in red.`);
        return;
      }
      const json = exportChapterCollection();
      const blob = new Blob([JSON.stringify(json, null, 2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chapter_collection_${new Date().toISOString().slice(0,19)}.json`;
      a.click();
    };

    // adders use transactions + afterInsertFocus
    document.getElementById('btnAddChapter').onclick = () => {
      const f = getFocusedCtx();
      const base = f?.data || null;
      const idx = f ? f.rowIndex + 1 : 0;
      const row = emptyRowForType('chapter', base);
      const res = api.applyTransaction({ add:[row], addIndex: idx });
      const added = res?.add?.[0]; if (added) afterInsertFocus(added.data.id);
    };
    document.getElementById('btnAddTopic').onclick = () => {
      const f = getFocusedCtx(); if (!f) return;
      const ch = f.data.path[0];
      const row = { ...emptyRowForType('topic', { path:[ch] }), path:[ch, uid('t')] };
      const res = api.applyTransaction({ add:[row], addIndex: f.rowIndex + 1 });
      const added = res?.add?.[0]; if (added) afterInsertFocus(added.data.id);
    };
    document.getElementById('btnAddSubtopic').onclick = () => {
      const f = getFocusedCtx(); if (!f) return;
      const p = f.data.path || [];
      let ch = p[0], topicKey = null;
      if (p.length === 2) topicKey = p[1];
      if (p.length === 3) topicKey = p[1];
      if (!topicKey) return alert('Select a topic or a row below it to insert a subtopic.');
      const row = { ...emptyRowForType('topic', { path:[ch] }), path:[ch, topicKey, uid('s')] };
      const res = api.applyTransaction({ add:[row], addIndex: f.rowIndex + 1 });
      const added = res?.add?.[0]; if (added) afterInsertFocus(added.data.id);
    };
    document.getElementById('btnInsertAbove').onclick = () => insertRelative(-1);
    document.getElementById('btnInsertBelow').onclick = () => insertRelative(1);
    document.getElementById('btnDelete').onclick = () => deleteCurrentRow(true);

    function insertRelative(dir){
      const f = getFocusedCtx(); if (!f) return;
      const type = f.data.type;
      const idx = f.rowIndex + (dir > 0 ? 1 : 0);
      const clone = emptyRowForType(type, f.data);
      if (type==='topic' && f.data.path.length===3 && clone.path.length===2){
        const [ch, topic] = f.data.path;
        clone.path = [ch, topic, uid('s')];
      }
      const res = api.applyTransaction({ add:[clone], addIndex: idx });
      const added = res?.add?.[0]; if (added) afterInsertFocus(added.data.id);
    }

    // ---------- Validation ----------
    function validateAll(){
      const errors = []; let first = null;
      api.forEachNodeAfterFilterAndSort(n => {
        const row = n.data; const req = REQUIRED[row.type] || [];
        req.forEach(f => {
          if (isEmpty(row[f])) {
            errors.push({ rowIndex: n.rowIndex, field: f, id: row.id, type: row.type });
            if (!first) first = { rowIndex: n.rowIndex, field: f };
          }
        });
      });
      return { errors, first };
    }

    // ---------- Hotkey handlers (Ctrl+...) ----------
    api.addEventListener('cellKeyDown', p => {
      const e = p.event;
      if (!e) return;
      if (e.ctrlKey) {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); return ctrlEnterInsertBelow(); }
        if (e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); return deleteCurrentRow(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); return promoteLeft(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); return demoteRight(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); return reorder(-1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); return reorder(1); }
      }
    });

    function ctrlEnterInsertBelow(){
      const f = getFocusedCtx(); if (!f) return;
      const ch = f.data.path[0];
      const row = { ...emptyRowForType('topic', { path:[ch] }), path:[ch, uid('t')] };
      const res = api.applyTransaction({ add:[row], addIndex: f.rowIndex + 1 });
      const added = res?.add?.[0]; if (added) afterInsertFocus(added.data.id);
    }

    // CHANGED: все тяжёлые операции — через defer(rAF) + транзакции

    function promoteLeft(){ // subtopic -> topic
      const f = getFocusedCtx(); if (!f) return;
      const p = f.data.path || [];
      if (f.data.type !== 'topic' || p.length !== 3) return;
      const [ch] = p;
      const row = f.node.data;
      row.path = [ch, row.id];
      defer(() => {
        api.applyTransaction({ update: [row] });
        refocusById(row.id);
      });
    }

    function demoteRight(){ // topic -> subtopic (to previous topic)
      const f = getFocusedCtx(); if (!f) return;
      const p = f.data.path || [];
      if (f.data.type !== 'topic' || p.length !== 2) return;
      const ch = p[0];
      // предыдущий видимый ТОПИК
      let prevTopicId = null;
      for (let i = f.rowIndex - 1; i >= 0; i--){
        const n = api.getDisplayedRowAtIndex(i);
        if (!n) break;
        const np = n.data.path || [];
        if (np[0] !== ch) break;
        if (n.data.type==='topic' && np.length===2){ prevTopicId = np[1]; break; }
      }
      if (!prevTopicId) { alert('The first topic in a chapter cannot be converted to a subtopic.'); return; }
      const row = f.node.data;
      row.path = [ch, prevTopicId, row.id];
      defer(() => {
        api.applyTransaction({ update: [row] });
        refocusById(row.id);
      });
    }

    function reorder(dir){ // dir=-1 up, +1 down
      const f = getFocusedCtx(); if (!f) return;
      const p = f.data.path || [];
      if (f.data.type !== 'topic') return;
      const ch = p[0];

      const aNode = api.getDisplayedRowAtIndex(f.rowIndex);
      const bNode = api.getDisplayedRowAtIndex(f.rowIndex + dir);
      if (!aNode || !bNode) return;

      const np = bNode.data.path || [];
      if (bNode.data.type==='chapter' || np[0] !== ch) return;

      // запрет: первый элемент чаптера не должен стать сабтопиком
      let chapterIdx = f.rowIndex;
      while (chapterIdx >= 0){
        const n = api.getDisplayedRowAtIndex(chapterIdx);
        if (n.data.type==='chapter' && (n.data.path||[])[0]===ch) break;
        chapterIdx--;
      }
      const firstChildIdx = chapterIdx + 1;
      if (dir < 0 && bNode.rowIndex === firstChildIdx && aNode.data.path.length === 3) {
        return alert('Reorder would make a subtopic the first item of the chapter. Operation cancelled.');
      }
      if (dir > 0 && aNode.rowIndex === firstChildIdx && bNode.data.path.length === 3) {
        return alert('Reorder would make a subtopic the first item of the chapter. Operation cancelled.');
      }

      const minIdx = Math.min(aNode.rowIndex, bNode.rowIndex);
      const aData = aNode.data, bData = bNode.data;

      defer(() => {
        api.applyTransaction({ remove: [aData, bData] });
        const addOrder = dir < 0 ? [aData, bData] : [bData, aData];
        api.applyTransaction({ add: addOrder, addIndex: minIdx });
        refocusById(aData.id);
      });
    }

    function deleteCurrentRow(){
      const f = getFocusedCtx(); if (!f) return;
      const p = f.data.path || [];

      if (f.data.type === 'chapter' && p.length === 1){
        if (!confirm('Delete the chapter and all its children?')) return;
        const ch = p[0];
        defer(() => {
          const toRemove = [];
          api.forEachNode(n => { if ((n.data.path||[])[0] === ch) toRemove.push(n.data); });
          api.applyTransaction({ remove: toRemove });
        });
        return;
      }

      if (f.data.type === 'topic' && p.length === 3){
        return defer(() => api.applyTransaction({ remove: [f.node.data] }));
      }

      if (f.data.type === 'topic' && p.length === 2){
        const ch = p[0], topicId = p[1];
        // предыдущий видимый ТОПИК
        let prevTopicId = null;
        for (let i = f.rowIndex - 1; i >= 0; i--){
          const n = api.getDisplayedRowAtIndex(i);
          if (!n) break;
          const np = n.data.path || [];
          if (np[0] !== ch) break;
          if (n.data.type === 'topic' && np.length === 2){ prevTopicId = np[1]; break; }
        }
        if (!prevTopicId) return alert('Cannot delete the first topic: there is no previous topic to reparent its subtopics.');

        defer(() => {
          const updates = [];
          api.forEachNode(n => {
            const pp = n.data.path || [];
            if (n.data.type==='topic' && pp.length===3 && pp[0]===ch && pp[1]===topicId){
              n.data.path = [ch, prevTopicId, n.data.id];
              updates.push(n.data);
            }
          });
          if (updates.length) api.applyTransaction({ update: updates });
          api.applyTransaction({ remove: [f.node.data] });
          refocusById(prevTopicId);
        });
      }
    }

    // ---------- Toggle collapse ----------
    document.getElementById('btnToggle').onclick = () => {
      if (collapsed.size === 0) {
        const keys = [];
        api.forEachNode(n => {
          const p = n.data?.path || [];
          const isParent = n.data?._hasChildren && (n.data.type==='chapter' || (n.data.type==='topic' && p.length===2));
          if (isParent) keys.push(p.join('|'));
        });
        collapsed = new Set(keys);
      } else {
        collapsed.clear();
      }
      api.onFilterChanged();
      api.refreshCells({ columns: ['structure'] });
    };

    // ---------- Import / Export buttons ----------
    function validateAll(){
      const errors = []; let first = null;
      api.forEachNodeAfterFilterAndSort(n => {
        const row = n.data; const req = REQUIRED[row.type] || [];
        req.forEach(f => {
          if (isEmpty(row[f])) {
            errors.push({ rowIndex: n.rowIndex, field: f, id: row.id, type: row.type });
            if (!first) first = { rowIndex: n.rowIndex, field: f };
          }
        });
      });
      return { errors, first };
    }

function allowedFieldForRow(rowData, field){
  if (field === 'structure') return false;
  const allowed = rowData.type === 'chapter' ? COLS.chapter : COLS.topic;
  return allowed.includes(field);
}

function onCopy(e){
  // если сейчас редактируем поле — не вмешиваемся
  if (isEditingInput(e.target) || isGridEditing()) return;

  const f = api.getFocusedCell();
  if (!f) return;
  const node = api.getDisplayedRowAtIndex(f.rowIndex);
  if (!node) return;
  const field = f.column.getColId();
  const row = node.data || {};
  if (!allowedFieldForRow(row, field)) return;

  const val = row[field] ?? '';
  e.clipboardData.setData('text/plain', String(val));
  e.preventDefault();
}

function onCut(e){
  // при редактировании — отдать браузеру
  if (isEditingInput(e.target) || isGridEditing()) return;

  onCopy(e); // скопировали
  if (e.defaultPrevented){ // мы взяли управление
    const f = api.getFocusedCell();
    if (!f) return;
    const node = api.getDisplayedRowAtIndex(f.rowIndex);
    if (!node) return;
    const field = f.column.getColId();
    const row = node.data || {};
    if (!allowedFieldForRow(row, field)) return;
    node.setDataValue(field, ''); // очистили
  }
}


function onPaste(e){
  // если редактируем — не перехватываем: вставка пойдёт в каретку
  if (isEditingInput(e.target) || isGridEditing()) return;

  const text = e.clipboardData.getData('text/plain');
  if (!text) return;

  const f = api.getFocusedCell();
  if (!f) return;
  const startNode = api.getDisplayedRowAtIndex(f.rowIndex);
  if (!startNode) return;
  const startField = f.column.getColId();

  if (!allowedFieldForRow(startNode.data, startField)){
    e.preventDefault();
    return;
  }

  const lines = text.replace(/\r/g,'').split('\n');
  const rowsParsed = lines.filter(l => l.length>0).map(l => l.split('\t'));

  const visibleCols = api.getAllDisplayedColumns().map(c => c.getColId());
  const startColIdx = visibleCols.indexOf(startField);

  for (let r = 0; r < rowsParsed.length; r++){
    const rowNode = api.getDisplayedRowAtIndex(f.rowIndex + r);
    if (!rowNode) break;
    const rowData = rowNode.data;

    for (let c = 0; c < rowsParsed[r].length; c++){
      const colId = visibleCols[startColIdx + c];
      if (!colId) break;
      if (!allowedFieldForRow(rowData, colId)) continue;
      rowNode.setDataValue(colId, rowsParsed[r][c]);
    }
  }
  e.preventDefault();
}

    // Demo: ?demo=1
    if (location.search.includes('demo')){
      const demo = {"type":"chapter_collection","version":1,"exportedAt":"2025-08-07T20:21:32Z","chapters":[{"primaryLanguage":"de","secondaryLanguage":"ru","name":"Begrüßungen","description":"Изучаем немецкие приветствия","metadata":"{\"authors\":[\"Cruise Learn\"],\"tags\":[\"приветствия\"]}","topics":[{"primaryText":"Guten Tag","primaryTextSpeech":"Guten Tag","secondaryText":"Добрый день","secondaryTextSpeech":"Добрый день","description":"Стандартное приветствие в течение дня","metadata":"{\"tags\":[\"формальное\"]}","subtopics":[]},{"primaryText":"Guten Morgen","primaryTextSpeech":"Guten Morgen","secondaryText":"Доброе утро","secondaryTextSpeech":"Доброе утро","description":"Утреннее приветствие","metadata":"{\"tags\":[\"утро\"]}","subtopics":[{"primaryText":"Schönen Morgen!","primaryTextSpeech":"Schönen Morgen!","secondaryText":"Прекрасного утра!","secondaryTextSpeech":"Прекрасного утра!","description":"Дополнение к 'Guten Morgen'","metadata":"{\"tags\":[\"вариация\"]}"}]},{"primaryText":"Hallo","primaryTextSpeech":"Hallo","secondaryText":"Привет","secondaryTextSpeech":"Привет","description":"Неформальное приветствие","metadata":"{\"tags\":[\"неформальное\"]}","subtopics":[]}]}]};
      api.setGridOption('rowData', importChapterCollection(demo));
      collapsed.clear(); recomputeHasChildren(); api.onFilterChanged();
    }

// === CSV Export ===
(function(){
  function csvEscape(v){ if (v == null) v = ''; v = String(v); return '"' + v.replace(/"/g,'""') + '"'; }
  function structureText(data){
    const level = (data.path?.length || 1) - 1;
    const baseName = data.type === 'chapter' ? (data.name || '') : (data.primaryText || '');
    const indent = '  '.repeat(Math.max(0, level));
    return indent + baseName;
  }
  function buildCsvFromGrid(){
    const cols = gridOptions.api.getAllDisplayedColumns();
    const headers = cols.map(c => (c.getColDef().headerName || c.getColId()));
    const out = [ headers.map(csvEscape).join(',') ];
    gridOptions.api.forEachNodeAfterFilterAndSort(n => {
      const row = n.data || {};
      const allowed = row.type === 'chapter' ? COLS.chapter : COLS.topic;
      const vals = cols.map(col => {
        const colId = col.getColId();
        const colDef = col.getColDef();
        if (colId === 'structure') return csvEscape(structureText(row));
        const field = colDef.field;
        if (!field) return csvEscape('');
        if (!allowed.includes(field)) return csvEscape(''); // «серые»/недоступные колонки — пусто
        return csvEscape(row[field] ?? '');
      });
      out.push(vals.join(','));
    });
    return "\uFEFF" + out.join('\r\n'); // BOM для корректного открытия в Excel на Windows
  }
  const btn = document.getElementById('btnExportCsv');
  if (btn){
    btn.addEventListener('click', () => {
      const csv = buildCsvFromGrid();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
      a.download = `content_export_${ts}.csv`;
      a.click();
    });
  }
})();
