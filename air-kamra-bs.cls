% Air University Kamra BS FYP Template
% Prepared By: Mustajab Hussain <mustajab@aack.au.edu.pk>
%
% Version History
% 0.1 11-07-2024
% 0.2 19-03-2025

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{air-kamra-bs}[20/05/21 v0.3 AIR-KAMRA BS Thesis Class]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax
\LoadClass[12pt, a4paper]{book}

\RequirePackage{amssymb, amsmath, amsthm, amstext}
\RequirePackage{tikz}
\RequirePackage{tocloft}
\RequirePackage{longtable}
\RequirePackage[sort, numbers, authoryear]{natbib}
\RequirePackage{emptypage}
\RequirePackage{graphics}
\RequirePackage{graphicx}
\RequirePackage{fancyhdr}
\RequirePackage{eucal}
\RequirePackage{soul}
\RequirePackage[english]{babel}
\RequirePackage{etoolbox}
\RequirePackage[perpage]{footmisc}
\RequirePackage{ifthen}
\RequirePackage{ifpdf}
\RequirePackage[utf8]{inputenc}
\RequirePackage{epsfig}
\RequirePackage{sectsty} 
\RequirePackage{titlesec}
\RequirePackage{setspace} 
\RequirePackage[lmargin=3cm,rmargin=3cm,
				tmargin=2.5cm,bmargin=2.5cm,
				includefoot]{geometry}
\RequirePackage[bookmarks,
                bookmarksopen = true,
                bookmarksnumbered = true,
                breaklinks = true,
                linktocpage,
                pagebackref = false,
                ocgcolorlinks,
				colorlinks = true,
                linkcolor = blue,
                urlcolor  = blue,
                citecolor = red,
                anchorcolor = green,
                hyperindex = true,
                hyperfigures
                ]{hyperref}

\pagestyle{fancy}
\renewcommand{\chaptermark}[1]{\markboth{\thechapter. #1 }{}}
\renewcommand{\sectionmark}[1]{\markright{\thesection\ #1}}
\fancyhf{}
\fancyhead[R]{\footnotesize Project Report: \@title}
\fancyfoot[R]{\textbf{\thepage}}
\fancyfoot[L]{\footnotesize Department of Computer Science, Air University, Aerospace \& Aviation Campus Kamra}
\fancypagestyle{myheadings}{
  \fancyhead{}
  \renewcommand{\headrulewidth}{0pt}
}

% --------- Changing Table of Contents text------
\addto\captionsenglish{
  \renewcommand{\contentsname}
    {Table of Contents}
}
% --------- Changing Table of Contents text------

\addtocontents{toc}{\protect\thispagestyle{fancy}}
\pagenumbering{gobble}

\DeclareUnicodeCharacter{2713}{\checkmark}

\newcommand{\mychapterfontsize}{\fontsize{44}{44}\selectfont}

\titleclass{\chapter}{straight}
\titleformat{\chapter}[display]
  {\normalfont\mychapterfontsize\bfseries\centering} % format
  {\vspace*{\stretch{1}}\Huge\textbf{Chapter \thechapter}} % label
  {2ex} % separation between label and title
  {\mychapterfontsize} % before code
  [\vspace*{\stretch{1}}\thispagestyle{empty}] % after code

%%%%%%%%%%%%%%%%%% General Settings
\linespread{1.5}
\setlength{\parindent}{0cm}
\setlength{\parskip}{0.1em}
\setcounter{secnumdepth}{3} % For TOC
\setcounter{tocdepth}{3}
\pdfcompresslevel=9
\DeclareGraphicsExtensions{.png, .jpg, .jpeg, .pdf, .eps, .ps}
%%%%%%%%%%%%%%%%%%
\newcommand{\signedby}[1]{%
	\vspace{2cm}
	\par\noindent\hspace{7.5cm}\hrulefill\par
	\par\noindent\hspace{7.5cm}{\large #1}\par
	\vspace{0cm}
	\par\noindent\hspace{7.5cm}{\large Dated: }\par
}
\newcommand{\longsignedby}[1]{%
	\par\hspace{.2cm}\begin{minipage}[t]{.55\columnwidth}
	\noindent#1
	\end{minipage}
	\hfill
	\begin{minipage}[t]{.35\columnwidth}
		Signature: \hrulefill
	\end{minipage}
}
%%%%%%%%%%%%%%%%%%
\newcommand{\yellow}[1]{\hl{#1}}
\newcommand{\comments}[1]{} 
%%%%%%%%%%%%%%%%%%
\AfterEndPreamble{\maketitle}
%%%%%%%%%%%%%%%%%%

\newcommand{\submittedtext}{{A thesis submitted for the degree of}}

% DECLARATIONS
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\def\rollnumber#1{\gdef\@rollnumber{#1}}
\def\degreeyear#1{\gdef\@degreeyear{#1}}
\def\degreemonth#1{\gdef\@degreemonth{#1}}
\def\degree#1{\gdef\@degree{#1}}
\def\department#1{\gdef\@department{#1}}
\def\faculty#1{\gdef\@faculty{#1}}
\def\university#1{\gdef\@university{#1}}
\def\crest#1{\gdef\@crest{#1}}
\def\supervisor#1{\gdef\@supervisor{#1}}
\def\cosupervisor#1{\gdef\@cosupervisor{#1}}
\def\sessionduration#1{\gdef\@sessionduration{#1}}
\def\authorone#1#2#3{
	\gdef\@authoronename{#1}
	\gdef\@authoroneroll{#2}
    \gdef\@authoroneemail{#3}
}
\def\authortwo#1#2#3{
	\gdef\@authortwoname{#1}
	\gdef\@authortworoll{#2}
    \gdef\@authortwoemail{#3}
}
\def\authorthree#1#2#3{
	\gdef\@authorthreename{#1}
	\gdef\@authorthreeroll{#2}
    \gdef\@authorthreeemail{#3} 
}
\def\authorfour#1#2#3{
	\gdef\@authorfourname{#1}
	\gdef\@authorfourroll{#2}
    \gdef\@authorfouremail{#3} 
}
\def\degreename#1{\gdef\@degreename{#1}}
\def\campuscity#1{\gdef\@campuscity{#1}}
\def\internalexaminer#1{\gdef\@internalexaminer{#1}}
\def\externalexaminer#1#2{\gdef\@externalexaminer{#1\par\hspace{0cm}#2}}
\def\deanname#1{\gdef\@deanname{#1}}
\def\directorname#1{\gdef\@directorname{#1}}
\def\hodname#1{\gdef\@hodname{#1}}
\def\fypcoordinatorname#1{\gdef\@fypcoordinatorname{#1}}
\def\acknowledge#1{\gdef\@acknowledge{#1}}
\def\authoronefather#1{\gdef\@authoronefather{#1}}

%%%%%%%%%%%%%%%%%%%%%%%%%
% Some Important Environments
\newenvironment{alwayssingle}{%
       \@restonecolfalse\if@twocolumn\@restonecoltrue\onecolumn
       \else\newpage\fi}
       {\if@restonecol\twocolumn\else\newpage\fi}

\renewcommand{\maketitle}{%
\begin{alwayssingle}
	\renewcommand{\footnotesize}{\small}
    \renewcommand{\footnoterule}{\relax}
    \thispagestyle{empty}

\end{alwayssingle}
	
 % Title Page
 \setcounter{page}{0} 
    \begin{center}
        { \setstretch{1}
        \par{\fontsize{30}{30}\selectfont \textbf{\@title}}\par
        \vspace{0.5cm}
        \vspace{1cm}
        
        \begin{figure}[h]\centering
            \includegraphics[width=.30\columnwidth]{BS_FYP_Figs/air_univ_logo.png} 
        \end{figure}
        
        \vspace{1cm}
        
        \begin{tabular}{p{4cm} p{4cm} }
            
            \multicolumn{2}{c}{\Large By} \\
             & \\
            \large \@authoronename & \Large \@authoroneroll \\ 
            \large \@authortwoname & \Large \@authortworoll \\
            \large \@authorthreename & \Large \@authorthreeroll \\
        \end{tabular}

        \vspace{1cm}

        \begin{tabular}{p{3cm} p{3cm}}
            
            \multicolumn{2}{c}{\Large Submitted To} \\ 
             \\
            \multicolumn{2}{c}{\Large \@supervisor} \\ 
        \end{tabular}
        
        \vspace{1cm}
        
        \par{\fontsize{23}{23}\selectfont {\@department}}\par
        \vspace{0.5cm}
        \par{\fontsize{23}{23}\selectfont {\@university}}\par
        \vspace{0.5cm}
        \par{\fontsize{23}{23}\selectfont {\@campuscity}}\par
        \vspace{0.5cm}
        \par{\fontsize{23}{23}\selectfont {(\@sessionduration)}}\par
    }
    \end{center}
    
 \newpage

 \pagenumbering{roman}
  \addtocounter{page}{1}
 
	\vspace{1.5cm}
	
% First Table
\begin{table}[ht]
    \begin{tabularx}{\textwidth}{|X|p{8cm}|} 
        \hline
        \textbf{Type (Nature of project)} & \rule{0pt}{4ex} [\checkmark] Development \hspace{2cm} [ ] R\&D  \\ \hline
        \textbf{Area of specialization} & \rule{0pt}{4ex} [\checkmark] WebApp \hspace{1.6cm} [ ] Mobile Application \\ \rule{0pt}{4ex}
                                         & [ \checkmark] AI based \hspace{1.6cm} [ ] Embedded System \\ \hline
        \textbf{FYP ID} & \rule{0pt}{4ex} \\ \hline
    \end{tabularx}
\end{table}

\vspace{0.5cm}

% Second Table
\begin{table}[h!]
    \begin{tabularx}{\textwidth}{|p{1cm}|p{2cm}|p{3.2cm}|p{5cm}|X|}
        \hline
        \multicolumn{5}{|c|}{\textbf{Project Group Members}} \\ \hline
        \textbf{Sr. \#} & \textbf{Reg. \#} & \textbf{Student Name} & \textbf{Email ID} & \textbf{*Signature} \\ \hline
        1 & \@authoroneroll & \@authoronename & \@authoroneemail & \\ \hline
        2 & \@authortworoll & \@authortwoname & \@authortwoemail & \\ \hline
        3 & \@authorthreeroll & \@authorthreename & \@authorthreeemail & \\ \hline
    \end{tabularx}
\end{table}

    \vspace{0.5cm}

    \begin{tabular}{p{15cm}}
        
        *The candidates confirm that the work submitted is their own and appropriate credit has been given where reference has been made to work of others. \\ 
    \end{tabular}
\end{table}
    
	\clearpage

\pagenumbering{roman}
 \addtocounter{page}{2}
	\vspace{1.5cm}
    {\centering \Large \textbf{Plagiarism Certificate}\par}
    \vspace{0.5cm}
    { \setstretch{1} }
    
    \noindent This is to certify that, I \underline{\@authoronename S/o \@authoronefather}, group leader of FYP under registration no. \underline{\@authoroneroll} at \@department, \@university, \@campuscity. I declare that my FYP report is completely checked by my supervisor.

    \par\vspace{.25cm}
    \par \textbf{Name of group leader}
	\longsignedby{\@authoronename}
    \par\vspace{.25cm}
	\par \textbf{Supervisor}
	\longsignedby{\@supervisor}
	\par

    \vspace{1.5cm}
	\begin{center}
	
	\par \rule{0.5\textwidth}{.4pt}
	\par \@hodname
	\par HoD of \@department \\ \@university, \@campuscity
	\end{center}
	
    \clearpage
% ================== Change record starts ==============
  
    \vspace{1.5cm}
    {\centering \Huge \textbf{\@title}\par}
    \vspace{0.5cm}
    {\centering \Large \textbf{Change Record}\par}
    \vspace{0.5cm}

    \renewcommand{\arraystretch}{1.2} 
    \begin{longtable}{|>{\raggedright\arraybackslash}p{4.3cm}|>{\centering\arraybackslash}p{1.2cm}|>{\centering\arraybackslash}p{1.8cm}|>{\raggedright\arraybackslash}p{4.8cm}|>{\raggedright\arraybackslash}p{2.3cm}|} 
        \hline
        \textbf{Author(s)} & \textbf{Version} & \textbf{Date} & \textbf{Notes} & \textbf{Supervisor's Signature} \\ \hline
        \endfirsthead
        \hline
        \textbf{Author(s)} & \textbf{Version} & \textbf{Date} & \textbf{Notes} & \textbf{Supervisor's Signature} \\ \hline
        \endhead
        Muhammad Saad Zafar, Muhammad Hamayun Farasat, Hamza Tariq & 1.0 & 29-05-2025 & Initial drafts & \\ \hline
        Muhammad Saad Zafar, Muhammad Hamayun Farasat, Hamza Tariq & 1.1 & 14-06-2025 & Revised as per Supervisor Guidelines & \\ \hline
        Muhammad Hamayun Farasat & 1.2 & 12-10-2025 & Drafted Chapters 1 and 2 (Introduction and SRS specifications) & \\ \hline
        Muhammad Saad Zafar, Hamza Tariq & 1.3 & 02-11-2025 & Reviewed and compiled Chapters 1 and 2 functional constraints & \\ \hline
        Muhammad Hamayun Farasat & 1.4 & 05-12-2025 & Drafted Chapters 3 and 4 (Use Cases and System Design models) & \\ \hline
        Muhammad Saad Zafar, Hamza Tariq & 1.5 & 28-12-2025 & Reviewed Chapters 3 and 4; verified schemas and UML layouts & \\ \hline
        Muhammad Hamayun Farasat & 1.6 & 10-02-2026 & Drafted Chapters 5 and 6 (Implementation and Business Plan) & \\ \hline
        Muhammad Saad Zafar, Hamza Tariq & 1.7 & 15-03-2026 & Reviewed Chapters 5 and 6; validated algorithms and SWOT metrics & \\ \hline
        Muhammad Saad Zafar & 1.8 & 18-04-2026 & Written Chapter 7 (Testing and Evaluation) test cases and metrics & \\ \hline
        Hamza Tariq & 1.9 & 30-04-2026 & Reviewed Chapter 7 equivalence classes and regression limits & \\ \hline
        Muhammad Saad Zafar & 2.0 & 25-05-2026 & Overall document compilation, bibliography syncing, and final styling & \\ \hline
    \end{longtable}

\clearpage

  % =================== Approval starts ==================
    \vspace{10.5cm}
    
    \begin{center}
        \textbf{\fontsize{25}{25}\selectfont APPROVAL}
    \end{center}
    
    \vspace{0.2cm}
    
    \hrule
    \vspace{1cm}
    
    \textbf{PROJECT SUPERVISOR} \\[0.5cm]
    Name:   \underline{\hspace{6cm}} \\[0.5cm]
    Date:   \underline{\hspace{6cm}} \hspace{1cm} Signature:\underline{\hspace{6cm}} \\[2cm]
    
    \textbf{PROJECT MANAGER} \\[0.5cm]
    Date:\underline{\hspace{6cm}} \hspace{1cm} Signature:\underline{\hspace{6cm}} \\[2cm]
    
    \textbf{CHAIR DEPARTMENT} \\[0.5cm]
    Date:\underline{\hspace{6cm}} \hspace{1cm} Signature:\underline{\hspace{6cm}}

    \clearpage

  } 

  % ================= Dedication page starts =================
    \newenvironment{dedication} {
	\begin{alwayssingle} 
		\begin{center}
			\vspace*{1.5cm}
			{\fontsize{25}{25}\selectfont \bfseries Dedication}
		\end{center}
		\vspace{0.5cm}
}{
		\begin{flushright}
\par
	\ifx\@authoronename\undefined \else
		\@authoronename \\	\fi
	\ifx\@authortwoname\undefined \else
		\@authortwoname \\	\fi
	\ifx\@authorthreename\undefined \else
		\@authorthreename \\ \fi
	\ifx\@authorfourname\undefined \else
		\@authorfourname \fi
		\end{flushright}
	\end{alwayssingle}
	\clearpage
}

  % ================== Acknowledgement page starts ================

  \newenvironment{acknowledgements} {
	\begin{alwayssingle} 
		\begin{center}
			\vspace*{1.5cm}
			{\fontsize{25}{25}\selectfont \bfseries Acknowledgements}
		\end{center}
		\vspace{0.5cm}
}{
		\begin{flushright}
\par
	\ifx\@authoronename\undefined \else
		\@authoronename \\	\fi
	\ifx\@authortwoname\undefined \else
		\@authortwoname \\	\fi
	\ifx\@authorthreename\undefined \else
		\@authorthreename \\ \fi
	\ifx\@authorfourname\undefined \else
		\@authorfourname \fi
		\end{flushright}
	\end{alwayssingle}
	\clearpage
}

  % ================== Executive summary page starts ==========

  \newenvironment{executiveSummary} {
	\begin{alwayssingle} 
		\begin{center}
			\vspace*{1.5cm}
			{\fontsize{25}{25}\selectfont \bfseries Executive Summary}
		\end{center}
		\vspace{0.5cm}
}{
		
	\end{alwayssingle}
	\clearpage
}

\newenvironment{abstract} {
	\begin{alwayssingle} 
		\begin{center}
			\vspace*{1.5cm}
			{\fontsize{25}{25}\selectfont \bfseries Abstract}
		\end{center}
  		\vspace{0.5cm}
}{
	\end{alwayssingle}
	\clearpage
	
	\tableofcontents
		\clearpage
	\listoffigures     \thispagestyle{fancy}
		\clearpage
	\listoftables      \thispagestyle{fancy}
	\pagenumbering{arabic}
	\setcounter{page}{0}	
}
