import type { ChangeEvent } from 'react';

type FileStepProps = {
  resumeFile: File | null;
  portfolioFile: File | null;
  fileError: string | null;
  onResumeChange: (file: File | null) => void;
  onPortfolioChange: (file: File | null) => void;
};

export function FileStep({
  resumeFile,
  portfolioFile,
  fileError,
  onResumeChange,
  onPortfolioChange,
}: FileStepProps) {
  const selectFile = (handler: (file: File | null) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    handler(event.target.files?.[0] ?? null);
  };

  return (
    <div className="form-stack">
      <div className="file-guidance" id="file-guidance">
        <span className="file-guidance__index" aria-hidden="true">10</span>
        <div>
          <strong>파일당 최대 10MB</strong>
          <p>PDF, DOC, DOCX 형식만 선택할 수 있습니다. 첨부 파일은 임시 저장에 보관되지 않고 현재 화면의 메모리에만 유지됩니다.</p>
        </div>
      </div>
      <div className="file-field" data-selected={resumeFile ? 'true' : 'false'}>
        <div className="file-field__heading">
          <label htmlFor="resume-file">이력서 <span aria-hidden="true">*</span></label>
          <span>필수</span>
        </div>
        <input
          id="resume-file"
          aria-label="이력서"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-describedby={`file-guidance${fileError ? ' resume-error' : ''}`}
          aria-invalid={Boolean(fileError)}
          onChange={selectFile(onResumeChange)}
        />
        <p className="file-field__selection">{resumeFile ? `선택됨 · ${resumeFile.name}` : '선택된 파일이 없습니다.'}</p>
        {fileError && <p className="field-error" id="resume-error">{fileError}</p>}
      </div>
      <div className="file-field" data-selected={portfolioFile ? 'true' : 'false'}>
        <div className="file-field__heading">
          <label htmlFor="portfolio-file">포트폴리오</label>
          <span>선택</span>
        </div>
        <input
          id="portfolio-file"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-describedby="file-guidance"
          onChange={selectFile(onPortfolioChange)}
        />
        <p className="file-field__selection">{portfolioFile ? `선택됨 · ${portfolioFile.name}` : '추가로 보여줄 자료가 있다면 첨부해주세요.'}</p>
      </div>
    </div>
  );
}
