// ★★ 注意: テーブル名はダミーです ★★
// 実際の運用前に以下のテーブル名を実際の名称に変更してください。
//   MST_BRANCH     → 実テーブル名 (例: mst_shiten)
//   MST_EMPLOYEE   → 実テーブル名 (例: mst_shain)
//   MST_BRANCH_EMP → 実テーブル名 (例: mst_shiten_shain)
// カラム名は実際のものをそのまま使用しています。

const BRANCH_SELECT = `
  SELECT shiten_cd, shiten_nm
  FROM MST_BRANCH
  WHERE kaisha_cd = :kaishaCd
    AND seq > 0
    AND DEL_FLG = 0
  ORDER BY seq
`;

const EMPLOYEE_SELECT = `
  SELECT
    e.shain_cd,
    e.shain_nm,
    be.seq
  FROM MST_EMPLOYEE e
  LEFT JOIN MST_BRANCH_EMP be
    ON e.shain_cd = be.shain_cd
    AND be.kaisha_cd = :kaishaCd
    AND be.seq > 0
    AND be.yuko_from <= SYSDATE
    AND be.yuko_to >= SYSDATE
    AND be.DEL_FLG = 0
    AND e.DEL_FLG = 0
  WHERE be.shiten_cd = :shitenCd
  ORDER BY be.seq
`;

const EMPLOYEE_SEQ_UPDATE = `
  UPDATE MST_BRANCH_EMP
  SET seq = :seq
  WHERE shain_cd  = :shainCd
    AND shiten_cd = :shitenCd
    AND kaisha_cd = :kaishaCd
`;

module.exports = { BRANCH_SELECT, EMPLOYEE_SELECT, EMPLOYEE_SEQ_UPDATE };
