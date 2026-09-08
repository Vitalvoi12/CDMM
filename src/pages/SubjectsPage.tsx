import { useState, useCallback } from 'react';
import { subjectRepo, tombstoneRepo } from '../services/repositories';
import { useSyncRefresh } from '../hooks/useServerSync';
import type { Subject } from '../types';
import { SubjectGrid } from '../components/subjects/SubjectGrid';
import { SubjectForm } from '../components/subjects/SubjectForm';

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>(subjectRepo.getAll());
  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  const refresh = useCallback(() => setSubjects(subjectRepo.getAll()), []);

  useSyncRefresh(refresh);

  const handleAdd = useCallback(() => {
    setEditingSubject(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((subject: Subject) => {
    setEditingSubject(subject);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    tombstoneRepo.add('subjects', id);
    subjectRepo.delete(id);
    setShowForm(false);
    setEditingSubject(null);
    refresh();
  }, [refresh]);

  const handleSave = useCallback(
    (data: { name: string; color: string }) => {
      if (editingSubject) {
        subjectRepo.update(editingSubject.id, data);
      } else {
        subjectRepo.create({ ...data, progress: 0 });
      }
      setShowForm(false);
      setEditingSubject(null);
      refresh();
    },
    [editingSubject, refresh]
  );

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingSubject(null);
  }, []);

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="flex items-end justify-between mb-8 max-lg:mb-3">
        <div>
          <p className="font-label-md text-label-md max-lg:!text-[10px] max-lg:mb-1 text-primary tracking-widest uppercase mb-2">
            Curriculum
          </p>
          <h2 className="font-display-lg text-display-lg max-lg:!text-[24px] max-lg:leading-none text-on-surface">Active Subjects</h2>
        </div>
        <button
          onClick={handleAdd}
          className="bg-primary hover:bg-tertiary-container transition-colors text-on-primary px-6 py-2 max-lg:px-3 max-lg:py-1 rounded flex items-center shadow-md gap-2"
        >
          <span className="material-symbols-outlined text-[20px] max-lg:text-[16px]">add</span>
          <span className="font-label-md text-label-md max-lg:!text-[10px] uppercase">Add Subject</span>
        </button>
      </div>

      <SubjectGrid subjects={subjects} onEdit={handleEdit} />

      {showForm && (
        <SubjectForm
          subject={editingSubject}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
