function escapeRTF(text = "") {
  return [...text]
    .map((c) => {
      const code = c.charCodeAt(0);

      switch (c) {
        case "\\":
          return "\\\\";
        case "{":
          return "\\{";
        case "}":
          return "\\}";
        case "\n":
          return "\\line ";
      }

      if (code > 127) {
        return `\\u${code}?`;
      }

      return c;
    })
    .join("");
}

function auteur(amendement) {
  if (amendement.rapporteur) {
    return "Rapporteur";
  }

  return amendement.auteurs?.join(", ") || "—";
}

function numero(amendement) {
  return amendement.rectification
    ? `${amendement.numero} ${amendement.rectification}`
    : amendement.numero;
}

function articleTitle(article) {
  return `ARTICLE ${article}`;
}

export function exportPreJaune(amendments) {
  if (!amendments.length) return;

  let body = "";

  let currentArticle = null;

  let currentGroup = null;
  let currentGroupType = null;

  amendments.forEach((a, index) => {
    //
    // New article
    //
    if (a.article !== currentArticle) {
      currentArticle = a.article;

      body += "\\par\\b ";
      body += escapeRTF(articleTitle(currentArticle));
      body += "\\b0\\par\\par";

      currentGroup = null;
      currentGroupType = null;
    }

    const groupe = a.resultat_ia?.groupe;

    const groupId = groupe?.groupe_id ?? null;
    const groupType = groupe?.type ?? null;

    //
    // Start of a group
    //
    if (
      groupId &&
      groupType !== "isole" &&
      groupType !== "doublon" &&
      groupId !== currentGroup
    ) {
      currentGroup = groupId;
      currentGroupType = groupType;

      const label =
        groupType === "identiques"
          ? "Id."
          : groupType === "discussion_commune"
          ? "Dc."
          : "";

      body += `${label}\\tab ╓\\tab `;
    } else if (
      groupId &&
      groupId === currentGroup
    ) {
      body += "\\tab ║\\tab ";
    } else {
      currentGroup = null;
      currentGroupType = null;

      body += "\\tab\\tab ";
    }

    body += escapeRTF(
      `Adt n° ${numero(a)} de ${auteur(a)}`
    );

    body += "\\par";

    //
    // End of group ?
    //
    if (
      currentGroup &&
      (
        index === amendments.length - 1 ||
        amendments[index + 1].resultat_ia?.groupe?.groupe_id !== currentGroup
      )
    ) {
      body += "\\tab ╙\\par";

      currentGroup = null;
      currentGroupType = null;
    }
  });

  const rtf =
`{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Calibri;}}
\\fs22
${body}
}`;

  const blob = new Blob([rtf], {
    type: "application/rtf",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = "pre-jaune.rtf";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}